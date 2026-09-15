export const REFLECTION_EVIDENCE_CATEGORIES = ["physical_state", "mental_state", "conditions", "target_type", "direction", "speed", "location", "equipment_change", "possible_issue"] as const;
export const REFLECTION_EVIDENCE_BASES = ["self_report", "ai_inference"] as const;
export const REFLECTION_EVIDENCE_CONFIDENCES = ["high", "medium", "low"] as const;
export type ReflectionEvidenceCategory = typeof REFLECTION_EVIDENCE_CATEGORIES[number];
export type ReflectionEvidenceBasis = typeof REFLECTION_EVIDENCE_BASES[number];
export type ReflectionEvidenceConfidence = typeof REFLECTION_EVIDENCE_CONFIDENCES[number];
export type ReflectionEvidenceStatus = "pending" | "accepted" | "rejected";

export type ReflectionEvidenceItem = {
  id?: string; session_id?: string; source_note_id?: string; source_note_updated_at?: string;
  category: ReflectionEvidenceCategory; normalized_value: string; label: string;
  evidence_basis: ReflectionEvidenceBasis; confidence: ReflectionEvidenceConfidence;
  reference?: string | null; review_status?: ReflectionEvidenceStatus;
};

const categories = new Set<string>(REFLECTION_EVIDENCE_CATEGORIES);
const bases = new Set<string>(REFLECTION_EVIDENCE_BASES);
const confidences = new Set<string>(REFLECTION_EVIDENCE_CONFIDENCES);
const safeText = (value: unknown, max: number) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max && !/[\r\n]/.test(value);

export function validateReflectionEvidenceOutput(value: unknown): ReflectionEvidenceItem[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as any).items)) throw new Error("Malformed structured interpretation.");
  const items = (value as any).items;
  if (items.length > 8) throw new Error("Too many interpretation items.");
  return items.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Malformed interpretation item.");
    const row = item as Record<string, unknown>;
    if (!categories.has(String(row.category)) || !bases.has(String(row.evidence_basis)) || !confidences.has(String(row.confidence))) throw new Error("Unsupported interpretation value.");
    if (!safeText(row.normalized_value, 80) || !safeText(row.label, 160)) throw new Error("Invalid interpretation text.");
    if (row.reference != null && !safeText(row.reference, 60)) throw new Error("Invalid interpretation reference.");
    return { category: row.category as ReflectionEvidenceCategory, normalized_value: String(row.normalized_value).trim(), label: String(row.label).trim(), evidence_basis: row.evidence_basis as ReflectionEvidenceBasis, confidence: row.confidence as ReflectionEvidenceConfidence, reference: row.reference == null ? null : String(row.reference).trim() };
  });
}

export const reflectionEvidenceJsonSchema = {
  type: "object", additionalProperties: false, required: ["items"], properties: { items: { type: "array", maxItems: 8, items: { type: "object", additionalProperties: false, required: ["category", "normalized_value", "label", "evidence_basis", "confidence", "reference"], properties: {
    category: { type: "string", enum: REFLECTION_EVIDENCE_CATEGORIES }, normalized_value: { type: "string", minLength: 1, maxLength: 80 }, label: { type: "string", minLength: 1, maxLength: 160 }, evidence_basis: { type: "string", enum: REFLECTION_EVIDENCE_BASES }, confidence: { type: "string", enum: REFLECTION_EVIDENCE_CONFIDENCES }, reference: { type: ["string", "null"], maxLength: 60 },
  } } } },
} as const;

export function acceptedEvidenceSentence(item: ReflectionEvidenceItem) {
  return item.evidence_basis === "ai_inference" ? `One reviewed AI hypothesis is that ${item.label}.` : `You reported ${item.label}.`;
}
