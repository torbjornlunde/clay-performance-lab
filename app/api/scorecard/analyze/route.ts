import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AiConfigError, AiMalformedOutputError, AiRateLimitError, AiTimeoutError, analyzeScorecardImage } from "@/lib/ai/openaiScorecard";
import { getBillingMode } from "@/lib/entitlements/check";
import { FeatureAccessError, recordFeatureUsage, requirePaidCostAccess } from "@/lib/entitlements/server";
import { createEntitlementUserContext } from "@/lib/entitlements/userContext";

export const dynamic = "force-dynamic";
export const maxDuration = 70;

const MAX = 4 * 1024 * 1024;
const SUPPORTED = new Set(["image/jpeg", "image/png", "image/webp"]);
const fp = /^[a-f0-9]{64}$/i;

function supabaseForRequest(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  const auth = request.headers.get("authorization") || undefined;
  return createClient(url, key, { global: { headers: auth ? { Authorization: auth } : {} } });
}
function err(category: string, status = 400, message = category) { return NextResponse.json({ error: { category, message } }, { status }); }

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") || 0) > MAX + 200000) return err("image_too_large", 413, "Image upload is too large.");
    const supabase = supabaseForRequest(request);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return err("login_required", 401, "Log in to analyze a scorecard.");
    const { data: profile, error: profileError } = await supabase.from("user_access_profiles").select("user_id,access_status,system_role").eq("user_id", userData.user.id).maybeSingle();
    if (profileError) return err("forbidden", 403, "Scorecard photo import access could not be verified.");
    const { data: entitlement } = await supabase.from("user_entitlements").select("plan,status,valid_until").eq("user_id", userData.user.id).maybeSingle();
    try { requirePaidCostAccess("ai.scorecard_photo_import", createEntitlementUserContext({ userId: userData.user.id, accessProfile: profile || null, entitlement: entitlement || null, billingMode: getBillingMode(process.env) })); }
    catch (accessError) { if (accessError instanceof FeatureAccessError) return err("forbidden", accessError.status, accessError.message); throw accessError; }

    const form = await request.formData();
    const image = form.get("image");
    const imageFingerprint = String(form.get("imageFingerprint") || "");
    const totalTargets = Number(form.get("totalTargets") || 0);
    if (!fp.test(imageFingerprint)) return err("analysis_failed", 400, "Invalid image fingerprint.");
    if (!(image instanceof Blob)) return err("unsupported_image", 400, "Missing image.");
    if (!SUPPORTED.has(image.type)) return err("unsupported_image", 415, "Unsupported image type.");
    if (image.size > MAX) return err("image_too_large", 413, "Image upload is too large.");
    const result = await analyzeScorecardImage(image, { totalTargets: Number.isInteger(totalTargets) && totalTargets > 0 ? totalTargets : null, allowStructureDiscovery: true });
    await recordFeatureUsage(supabase, "ai.scorecard_photo_import", userData.user.id, { route: "/api/scorecard/analyze" });
    return NextResponse.json({ result, imageFingerprint, setupFingerprint: null, resolvedSetup: { postCount: result.postCount, targetsPerPostByPost: result.expectedTargetsByPost, totalTargets: result.detectedTotalTargets, setupMode: "discovery" } });
  } catch (e) {
    if (e instanceof AiConfigError) return err("ai_not_configured", 422, "AI analysis is not configured.");
    if (e instanceof AiRateLimitError) return err("rate_limited", 429, "AI analysis is temporarily rate limited.");
    if (e instanceof AiTimeoutError) return err("timed_out", 504, "AI analysis timed out.");
    if (e instanceof AiMalformedOutputError) return err("unreadable_scorecard", 422, "The scorecard could not be read safely.");
    return err("analysis_failed", 500, "Analysis failed.");
  }
}
