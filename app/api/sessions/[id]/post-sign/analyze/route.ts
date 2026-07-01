import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isPostBasedSportingDiscipline } from "@/lib/disciplines";
import { AiConfigError, AiRateLimitError, AiTimeoutError, analyzePostSignImage } from "@/lib/ai/openaiPostSign";
export const dynamic = "force-dynamic";
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_POST = 50;
const SUPPORTED = new Set(["image/jpeg", "image/png", "image/webp"]);
function supabaseForRequest(request: Request) { const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL; const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; if (!supabaseUrl || !supabaseAnonKey) throw new Error("Missing Supabase environment variables."); const authorization = request.headers.get("authorization") || undefined; return createClient(supabaseUrl, supabaseAnonKey, { global: { headers: authorization ? { Authorization: authorization } : {} } }); }
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const contentLength = Number(request.headers.get("content-length") || 0); if (contentLength > MAX_IMAGE_BYTES + 200_000) return NextResponse.json({ error: "Image upload is too large." }, { status: 413 });
    const supabase = supabaseForRequest(request); const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return NextResponse.json({ error: "You must be logged in to analyze a post sign." }, { status: 401 });
    const { data: session, error: sessionError } = await supabase.from("sessions").select("id,user_id,discipline,post_count,course_count").eq("id", id).single();
    if (sessionError || !session) return NextResponse.json({ error: "Session was not found." }, { status: 404 });
    if (session.user_id !== userData.user.id) return NextResponse.json({ error: "You do not have access to this session." }, { status: 403 });
    if (!isPostBasedSportingDiscipline(session.discipline)) return NextResponse.json({ error: "Post sign import is only available for post-based sporting sessions." }, { status: 422 });
    const form = await request.formData(); const postNumber = Number(form.get("postNumber")); const image = form.get("image");
    const practicalMax = Math.min(MAX_POST, Math.max(1, Number(session.post_count || session.course_count || MAX_POST)));
    if (!Number.isInteger(postNumber) || postNumber < 1 || postNumber > practicalMax) return NextResponse.json({ error: "Invalid post number." }, { status: 400 });
    if (!(image instanceof Blob)) return NextResponse.json({ error: "Missing image." }, { status: 400 });
    if (!SUPPORTED.has(image.type)) return NextResponse.json({ error: "Unsupported image type." }, { status: 415 });
    if (image.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Image upload is too large." }, { status: 413 });
    const result = await analyzePostSignImage(image);
    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof AiConfigError) return NextResponse.json({ error: "AI analysis is not configured." }, { status: 422 });
    if (error instanceof AiRateLimitError) return NextResponse.json({ error: "AI analysis is temporarily rate limited." }, { status: 429 });
    if (error instanceof AiTimeoutError) return NextResponse.json({ error: "AI analysis timed out." }, { status: 504 });
    if ((error as Error).message?.includes("Malformed")) return NextResponse.json({ error: "Could not read sign." }, { status: 422 });
    return NextResponse.json({ error: "Analysis failed." }, { status: 500 });
  }
}
