export const SCORECARD_EVIDENCE_BUCKET = "competition-scorecard-evidence";
export const SCORECARD_EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;
export const SCORECARD_EVIDENCE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type ScorecardEvidence = {
  id: string;
  session_id: string;
  user_id: string;
  course_number: number | null;
  storage_path: string;
  original_filename: string | null;
  content_type: string;
  size_bytes: number;
  created_at: string;
};

export function validateScorecardEvidenceFile(file: Pick<File, "type" | "size">) {
  if (!(SCORECARD_EVIDENCE_TYPES as readonly string[]).includes(file.type))
    return "Use a JPEG, PNG or WebP image.";
  if (file.size <= 0) return "Choose a non-empty image.";
  if (file.size > SCORECARD_EVIDENCE_MAX_BYTES) return "Image is too large. Maximum size is 10 MB.";
  return null;
}

function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 100) || "scorecard";
}

export function scorecardEvidencePath(userId: string, sessionId: string, filename: string, id = crypto.randomUUID()) {
  if (!userId || !sessionId || userId.includes("/") || sessionId.includes("/")) throw new Error("Invalid evidence owner or session.");
  return `${userId}/${sessionId}/${id}-${safeFilename(filename)}`;
}

// Storage is written first. Metadata is canonical and is never inserted for a failed upload.
export async function uploadScorecardEvidence(client: any, input: { userId: string; sessionId: string; courseNumber: number | null; file: File }) {
  const validation = validateScorecardEvidenceFile(input.file);
  if (validation) throw new Error(validation);
  const path = scorecardEvidencePath(input.userId, input.sessionId, input.file.name);
  const uploaded = await client.storage.from(SCORECARD_EVIDENCE_BUCKET).upload(path, input.file, { contentType: input.file.type, upsert: false });
  if (uploaded.error) throw uploaded.error;
  const inserted = await client.from("competition_scorecard_evidence").insert({ session_id: input.sessionId, user_id: input.userId, course_number: input.courseNumber, storage_path: path, original_filename: input.file.name, content_type: input.file.type, size_bytes: input.file.size }).select("*").single();
  if (inserted.error || !inserted.data) {
    await client.storage.from(SCORECARD_EVIDENCE_BUCKET).remove([path]);
    throw inserted.error || new Error("Evidence metadata could not be saved.");
  }
  return inserted.data as ScorecardEvidence;
}

export async function replaceScorecardEvidence(client: any, evidence: ScorecardEvidence, file: File) {
  const validation = validateScorecardEvidenceFile(file);
  if (validation) throw new Error(validation);
  const newPath = scorecardEvidencePath(evidence.user_id, evidence.session_id, file.name);
  const uploaded = await client.storage.from(SCORECARD_EVIDENCE_BUCKET).upload(newPath, file, { contentType: file.type, upsert: false });
  if (uploaded.error) throw uploaded.error;
  const updated = await client.from("competition_scorecard_evidence").update({ storage_path: newPath, original_filename: file.name, content_type: file.type, size_bytes: file.size }).eq("id", evidence.id).select("*").single();
  if (updated.error || !updated.data) {
    await client.storage.from(SCORECARD_EVIDENCE_BUCKET).remove([newPath]);
    throw updated.error || new Error("Replacement could not be saved.");
  }
  // The original remains canonical until the metadata update succeeds.
  await client.storage.from(SCORECARD_EVIDENCE_BUCKET).remove([evidence.storage_path]);
  return updated.data as ScorecardEvidence;
}

export async function deleteScorecardEvidence(client: any, evidence: ScorecardEvidence) {
  const deleted = await client.from("competition_scorecard_evidence").delete().eq("id", evidence.id);
  if (deleted.error) throw deleted.error;
  const removed = await client.storage.from(SCORECARD_EVIDENCE_BUCKET).remove([evidence.storage_path]);
  if (removed.error) throw new Error(`Photo was unlinked, but private storage cleanup failed: ${removed.error.message}`);
}
