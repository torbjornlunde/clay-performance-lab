import { postSignAnalysisJsonSchema, validatePostSignAnalysis } from "@/lib/targets/postSignAnalysis";
const ENDPOINT = "https://api.openai.com/v1/responses";
const TIMEOUT_MS = 25000;
export class AiConfigError extends Error {}
export class AiRateLimitError extends Error {}
export class AiTimeoutError extends Error {}
const prompt = `Interpret a clay shooting post/stand sign photo. Return only structured data. Understand Norwegian headings: Enkelt means singles, Rep.Par means report pairs, Sim.Par means simultaneous pairs, Standplass means stand/post. Preserve visible program order and repeated singles. For report pair AB return A then B; BA returns B then A. For simultaneous AB, A+B, SIM AB or AB SIM return A and B with simultaneous_pair. Extract post-wide instructions such as LIMIT PÅ A! into instructions, not target notes. Detected post numbers are informational only. Do not infer flight type, direction, speed, distance, difficulty, hits, misses, scores or totals. Use warnings and low confidence when uncertain. If text is unreadable, return low confidence and warnings.`;
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
    const json = await response.json(); const text = textFromResponse(json); if (!text) throw new Error("Malformed AI output.");
    return validatePostSignAnalysis(JSON.parse(text));
  } catch (error) { if ((error as any)?.name === "AbortError") throw new AiTimeoutError("AI analysis timed out."); throw error; }
  finally { clearTimeout(timeout); }
}
