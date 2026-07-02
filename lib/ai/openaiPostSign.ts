import { postSignAnalysisJsonSchema, validatePostSignAnalysis } from "@/lib/targets/postSignAnalysis";
const ENDPOINT = "https://api.openai.com/v1/responses";
const TIMEOUT_MS = 25000;
export class AiConfigError extends Error {}
export class AiRateLimitError extends Error {}
export class AiTimeoutError extends Error {}
export class AiMalformedOutputError extends Error {}
const prompt = `Interpret a clay shooting post/stand sign photo. Return only structured data. Understand Norwegian headings: Enkelt means singles, Rep.Par/report/on report means report pairs, Sim.Par/simultaneous/simo means simultaneous pairs, Standplass means stand/post. Preserve visible program order, repeated singles, exact visible sourceNotation (for example A+B, AB, A → B), labels, sourceText, confidence and warnings. Do not assume a universal punctuation rule: A+B is not always simultaneous and AB is not always report or simultaneous. Use explicit headings/legends or wording when present and set typeEvidence to explicit_heading or explicit_wording. When a programme is only a list such as A+B or AB and no explicit legend defines the convention, do not infer pair type solely from punctuation: set structuralKind pair, presentationType unknown, notationKind plus or joined, typeEvidence user_convention_required, preserve two targetLabels, lower confidence, and include a concise warning. Use notationKind explicit_report or explicit_simultaneous only when the sign itself explicitly defines the type. For report pairs, preserve label order. Extract post-wide instructions such as LIMIT PÅ A! into instructions, not target notes. Detected post numbers are informational only. Do not infer flight type, direction, speed, distance, difficulty, hits, misses, scores or totals. If text is unreadable, return low confidence and warnings.`;
function textFromResponse(json: any) { if (typeof json.output_text === "string") return json.output_text; const item = json.output?.flatMap((o: any) => o.content || []).find((c: any) => c.type === "output_text" && typeof c.text === "string"); return item?.text; }
export async function analyzePostSignImage(image: Blob) {
  const apiKey = process.env.OPENAI_API_KEY; const model = process.env.OPENAI_VISION_MODEL;
  if (!apiKey || !model) throw new AiConfigError("AI analysis is not configured.");
  const base64 = Buffer.from(await image.arrayBuffer()).toString("base64");
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(ENDPOINT, { method: "POST", signal: controller.signal, headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: `data:${image.type};base64,${base64}` }] }], text: { format: { type: "json_schema", name: "post_sign_analysis", strict: true, schema: postSignAnalysisJsonSchema } } }) });
    if (response.status === 429) throw new AiRateLimitError("AI analysis is temporarily rate limited.");
    if (!response.ok) throw new Error("AI analysis failed.");
    const json = await response.json(); const text = textFromResponse(json); if (!text) throw new AiMalformedOutputError("Malformed AI output.");
    try { return validatePostSignAnalysis(JSON.parse(text)); } catch { throw new AiMalformedOutputError("Malformed AI output."); }
  } catch (error) { if ((error as any)?.name === "AbortError") throw new AiTimeoutError("AI analysis timed out."); throw error; }
  finally { clearTimeout(timeout); }
}
