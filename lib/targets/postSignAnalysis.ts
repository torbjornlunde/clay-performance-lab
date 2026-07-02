import type { PresentationType } from "./postTargets";
export type Confidence = "high" | "medium" | "low";
export type NotationKind = "single" | "plus" | "joined" | "arrow" | "explicit_report" | "explicit_simultaneous" | "other";
export type TypeEvidence = "explicit_heading" | "explicit_wording" | "user_convention_required" | "uncertain";
export type StructuralKind = "single" | "pair";
export type PostSignPresentation = { presentationNumber: number; presentationType: PresentationType; structuralKind: StructuralKind; targetLabels: string[]; sourceText: string; sourceNotation: string; notationKind: NotationKind; typeEvidence: TypeEvidence; confidence: Confidence; warnings: string[] };
export type PostSignAnalysisResult = { detectedPostNumbers: number[]; rawText: string; instructions: string; confidence: Confidence; warnings: string[]; presentations: PostSignPresentation[]; notationConventions?: Record<string, "report_pair" | "simultaneous_pair" | "manual"> };
const confidence = new Set(["high", "medium", "low"]);
const presentationTypes = new Set(["single", "report_pair", "simultaneous_pair", "other_pair", "unknown"]);
const notationKinds = new Set(["single","plus","joined","arrow","explicit_report","explicit_simultaneous","other"]);
const typeEvidenceValues = new Set(["explicit_heading","explicit_wording","user_convention_required","uncertain"]);
export function isSimpleTargetLabel(label: string) { return /^[A-Z]$|^[0-9]{1,2}$/.test(label.trim().toUpperCase()); }
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
    const structuralKind = item?.structuralKind === "pair" || (type !== "single" && labels.length === 2) ? "pair" : "single";
    const notationKind = notationKinds.has(item?.notationKind) ? item.notationKind : inferNotationKind(item?.sourceNotation || item?.sourceText || "", structuralKind, type);
    const typeEvidence = typeEvidenceValues.has(item?.typeEvidence) ? item.typeEvidence : inferEvidence(type, notationKind);
    const expected = structuralKind === "single" ? 1 : 2;
    if (labels.length !== expected) throw new Error(`Presentation ${index + 1} has ${labels.length} labels; expected ${expected}.`);
    if (labels.some((label: string) => !isSimpleTargetLabel(label))) throw new Error(`Presentation ${index + 1} contains an invalid or combined target label.`);
    return { presentationNumber: index + 1, presentationType: structuralKind === "pair" && typeEvidence === "user_convention_required" ? "unknown" : type, structuralKind, targetLabels: labels, sourceText: typeof item?.sourceText === "string" ? item.sourceText.slice(0, 500) : "", sourceNotation: typeof item?.sourceNotation === "string" ? item.sourceNotation.slice(0, 80) : "", notationKind, typeEvidence, confidence: confidence.has(item?.confidence) ? item.confidence : "low", warnings: Array.isArray(item?.warnings) ? item.warnings.filter((x: unknown) => typeof x === "string").map((x: string) => x.slice(0, 300)) : [] };
  });
  return result;
}
function inferNotationKind(text: string, structuralKind: StructuralKind, type: PresentationType): NotationKind { if (structuralKind === "single") return "single"; if (type === "report_pair") return "explicit_report"; if (type === "simultaneous_pair") return "explicit_simultaneous"; if (/\+/.test(text)) return "plus"; if (/→|->/.test(text)) return "arrow"; if (/^[A-Z0-9]{2,4}$/.test(text.trim())) return "joined"; return "other"; }
function inferEvidence(type: PresentationType, notationKind: NotationKind): TypeEvidence { if (notationKind === "explicit_report" || notationKind === "explicit_simultaneous") return "explicit_heading"; if (type === "unknown") return "user_convention_required"; return "uncertain"; }
export const postSignAnalysisJsonSchema = { type: "object", additionalProperties: false, required: ["detectedPostNumbers","rawText","instructions","confidence","warnings","presentations"], properties: { detectedPostNumbers: { type: "array", items: { type: "integer" } }, rawText: { type: "string" }, instructions: { type: "string" }, confidence: { type: "string", enum: ["high","medium","low"] }, warnings: { type: "array", items: { type: "string" } }, presentations: { type: "array", items: { type: "object", additionalProperties: false, required: ["presentationNumber","presentationType","structuralKind","targetLabels","sourceText","sourceNotation","notationKind","typeEvidence","confidence","warnings"], properties: { presentationNumber: { type: "integer" }, presentationType: { type: "string", enum: ["single","report_pair","simultaneous_pair","other_pair","unknown"] }, structuralKind: { type: "string", enum: ["single","pair"] }, targetLabels: { type: "array", items: { type: "string" } }, sourceText: { type: "string" }, sourceNotation: { type: "string", maxLength: 80 }, notationKind: { type: "string", enum: ["single","plus","joined","arrow","explicit_report","explicit_simultaneous","other"] }, typeEvidence: { type: "string", enum: ["explicit_heading","explicit_wording","user_convention_required","uncertain"] }, confidence: { type: "string", enum: ["high","medium","low"] }, warnings: { type: "array", items: { type: "string" } } } } } } } as const;
