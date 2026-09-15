import type { ReflectionEvidenceItem } from "./reflectionEvidence";

export type ReflectionEvidenceSource = { id: string; updated_at: string };
export type ReviewableReflectionEvidence = ReflectionEvidenceItem & {
  source_note_id?: string;
  source_note_updated_at?: string;
  review_status?: "pending" | "accepted" | "rejected";
};

/** Return only reviewed evidence whose immutable provenance matches the current note revision. */
export function currentAcceptedReflectionEvidence<T extends ReviewableReflectionEvidence>(
  evidence: T[],
  notes: ReflectionEvidenceSource[],
): T[] {
  const currentRevisions = new Map(notes.map((note) => [note.id, note.updated_at]));
  return evidence.filter((item) =>
    item.review_status === "accepted" &&
    Boolean(item.source_note_id) &&
    currentRevisions.get(item.source_note_id!) === item.source_note_updated_at,
  );
}
