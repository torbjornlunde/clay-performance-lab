import type { PresentationType } from "./postTargets";
export type Confidence = "high" | "medium" | "low";
export type PostSignPresentation = { presentationNumber: number; presentationType: PresentationType; targetLabels: string[]; sourceText: string; confidence: Confidence; warnings: string[] };
export type PostSignAnalysisResult = { detectedPostNumbers: number[]; rawText: string; instructions: string; confidence: Confidence; warnings: string[]; presentations: PostSignPresentation[] };
const confidence = new Set(["high", "medium", "low"]);
const presentationTypes = new Set(["single", "report_pair", "simultaneous_pair", "other_pair", "unknown"]);
function normalizeLabel(label: unknown) { return typeof label === "string" ? label.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : ""; }
export function validatePostSignAnalysis(value: unknown): PostSignAnalysisResult {
  if (!value || typeof value !== "object") throw new Error("Malformed analysis result.");
  const raw = value as any;
  const result: PostSignAnalysisResult = {
    detectedPostNumbers: Array.isArray(raw.detectedPostNumbers) ? raw.detectedPostNumbers.map(Number).filter((n: number) => Number.isInteger(n) && n > 0 && n <= 50) : [],
    rawText: typeof raw.rawText === "string" ? raw.rawText.slice(0, 12000) : "",
    instructions: typeof raw.instructions === "string" ? raw.instructions.slice(0, 2000) : "",
    confidence: confidence.has(raw.confidence) ? raw.confidence : "low",
    warnings: Array.isArray(raw.warnings) ? raw.warnings.filter((x: unknown) => typeof x === "string").map((x: string) => x.slice(0, 300)) : [],
    presentations: [],
  };
  if (!Array.isArray(raw.presentations)) throw new Error("Missing presentation list.");
  result.presentations = raw.presentations.map((item: any, index: number) => {
    const type = presentationTypes.has(item?.presentationType) ? item.presentationType as PresentationType : "unknown";
    const labels = Array.isArray(item?.targetLabels) ? item.targetLabels.map(normalizeLabel).filter(Boolean) : [];
    const expected = type === "single" || type === "unknown" ? 1 : 2;
    if (labels.length !== expected) throw new Error(`Presentation ${index + 1} has ${labels.length} labels; expected ${expected}.`);
    if (labels.some((label: string) => /[+\s]/.test(label) || label.length > 4)) throw new Error(`Presentation ${index + 1} contains a combined label.`);
    return { presentationNumber: index + 1, presentationType: type, targetLabels: labels, sourceText: typeof item?.sourceText === "string" ? item.sourceText.slice(0, 500) : "", confidence: confidence.has(item?.confidence) ? item.confidence : "low", warnings: Array.isArray(item?.warnings) ? item.warnings.filter((x: unknown) => typeof x === "string").map((x: string) => x.slice(0, 300)) : [] };
  });
  return result;
}
export const postSignAnalysisJsonSchema = { type: "object", additionalProperties: false, required: ["detectedPostNumbers","rawText","instructions","confidence","warnings","presentations"], properties: { detectedPostNumbers: { type: "array", items: { type: "integer" } }, rawText: { type: "string" }, instructions: { type: "string" }, confidence: { type: "string", enum: ["high","medium","low"] }, warnings: { type: "array", items: { type: "string" } }, presentations: { type: "array", items: { type: "object", additionalProperties: false, required: ["presentationNumber","presentationType","targetLabels","sourceText","confidence","warnings"], properties: { presentationNumber: { type: "integer" }, presentationType: { type: "string", enum: ["single","report_pair","simultaneous_pair","other_pair","unknown"] }, targetLabels: { type: "array", items: { type: "string" } }, sourceText: { type: "string" }, confidence: { type: "string", enum: ["high","medium","low"] }, warnings: { type: "array", items: { type: "string" } } } } } } } as const;
