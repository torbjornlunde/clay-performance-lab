import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseClayArenaResults, validateClayArenaUrl } from "@/lib/clayarena/parser";
import { shooterProfileDisplayName, type ShooterProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";
// International championships can contain hundreds of shooters and several
// megabytes of server-rendered HTML. Keep a bound, but allow their results.
const MAX_PAGE_BYTES = 8_000_000;

function client(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing Supabase environment variables.");
  const authorization = request.headers.get("authorization");
  return createClient(url, key, { global: { headers: authorization ? { Authorization: authorization } : {} } });
}

async function readLimitedHtml(response: Response) {
  if (!response.ok || !(response.headers.get("content-type") || "").toLowerCase().includes("text/html")) throw new Error("Page unavailable");
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PAGE_BYTES) throw new Error("Page is too large");
  if (!response.body) throw new Error("Page has no body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_PAGE_BYTES) {
      await reader.cancel();
      throw new Error("Page is too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

async function fetchClayArenaHtml(url: string) {
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(12_000), headers: { Accept: "text/html", "User-Agent": "ClayPerformanceLab/1.0 result-import" } });
  if (response.status >= 300 && response.status < 400) throw new Error("ClayArena redirected the page");
  return readLimitedHtml(response);
}

export async function POST(request: Request) {
  const supabase = client(request);
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "You must be logged in to import results." }, { status: 401 });
  const body = await request.json().catch(() => null) as { url?: unknown } | null;
  const validated = validateClayArenaUrl(typeof body?.url === "string" ? body.url.trim() : "");
  if (!validated) return NextResponse.json({ error: "Paste a supported public ClayArena competition results URL." }, { status: 400 });
  const { data: profile } = await supabase.from("shooter_profiles").select("shooter_name,first_name,last_name").eq("user_id", auth.user.id).maybeSingle<Pick<ShooterProfile, "shooter_name" | "first_name" | "last_name">>();
  const profileName = shooterProfileDisplayName(profile);
  if (!profileName) return NextResponse.json({ error: "Add your shooter name to your profile before importing." }, { status: 400 });
  try {
    const detailUrl = new URL(validated.url);
    detailUrl.pathname = detailUrl.pathname.replace(/results\/?$/i, "");
    const html = await fetchClayArenaHtml(validated.url);
    const detailHtml = await fetchClayArenaHtml(detailUrl.toString()).catch(() => "");
    const candidates = parseClayArenaResults(html, validated.url, profileName, detailHtml);
    const matches = candidates.filter((candidate) => candidate.matchStatus !== "no_match");
    const reviewCandidates = matches.length ? matches : candidates;
    return NextResponse.json({ candidates: reviewCandidates, matchState: matches.some((candidate) => candidate.matchStatus === "matched_to_you") ? "matched_to_you" : matches.length ? "possible_match" : "no_match" });
  } catch {
    return NextResponse.json({ error: "We could not read this public ClayArena results page." }, { status: 502 });
  }
}

export const __test = { readLimitedHtml };
