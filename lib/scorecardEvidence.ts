export const SCORECARD_EVIDENCE_BUCKET = "competition-scorecard-evidence";
export const SCORECARD_EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;
export const SCORECARD_EVIDENCE_SIGNED_URL_SECONDS = 300;
export const SCORECARD_EVIDENCE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type ScorecardEvidence = {
  id: string; session_id: string; user_id: string; course_number: number | null;
  storage_path: string; original_filename: string | null; content_type: string;
  size_bytes: number; created_at: string; updated_at: string;
};

const MIME_EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export function validateScorecardEvidenceFile(file: Pick<File, "type" | "size">) {
  if (!MIME_EXTENSIONS[file.type]) return "Use a JPEG, PNG or WebP image.";
  if (file.size <= 0) return "Choose a non-empty image.";
  if (file.size > SCORECARD_EVIDENCE_MAX_BYTES) return "Image is too large. Maximum size is 10 MB.";
  return null;
}

export type ScorecardEvidenceBatchResult = {
  total: number;
  successful: number;
  message: string;
};

export async function uploadScorecardEvidenceBatch(
  files: readonly File[],
  upload: (file: File) => Promise<unknown>,
  reconcile: () => Promise<unknown>,
): Promise<ScorecardEvidenceBatchResult> {
  const invalid = files.map((file) => validateScorecardEvidenceFile(file)).find(Boolean);
  if (invalid) return { total: files.length, successful: 0, message: invalid };

  let successful = 0;
  let failure = "";
  for (const file of files) {
    try {
      await upload(file);
      successful += 1;
    } catch (error) {
      failure = (error as { message?: string } | null)?.message || "Unknown upload error.";
      break;
    }
  }
  if (successful > 0) await reconcile();
  if (!failure) return { total: files.length, successful, message: `${successful} photo${successful === 1 ? "" : "s"} attached.` };
  if (successful === 0) return { total: files.length, successful, message: `Photo upload failed: ${failure}` };
  return { total: files.length, successful, message: `${successful} of ${files.length} photos attached. The next photo could not be uploaded: ${failure}` };
}

export function scorecardEvidencePath(userId: string, sessionId: string, mimeType: string, id = crypto.randomUUID()) {
  if (!userId || !sessionId || userId.includes("/") || sessionId.includes("/")) throw new Error("Invalid evidence owner or session.");
  const extension = MIME_EXTENSIONS[mimeType];
  if (!extension) throw new Error("Unsupported scorecard evidence MIME type.");
  return `${userId}/${sessionId}/${id}.${extension}`;
}

export async function createScorecardEvidenceSignedUrl(client: any, storagePath: string) {
  const result = await client.storage.from(SCORECARD_EVIDENCE_BUCKET).createSignedUrl(storagePath, SCORECARD_EVIDENCE_SIGNED_URL_SECONDS);
  if (result.error || !result.data?.signedUrl) throw result.error || new Error("Private image could not be opened.");
  return result.data.signedUrl as string;
}

async function removeWithOneRetry(client: any, path: string) {
  let result = await client.storage.from(SCORECARD_EVIDENCE_BUCKET).remove([path]);
  if (result.error) result = await client.storage.from(SCORECARD_EVIDENCE_BUCKET).remove([path]);
  return result.error as { message?: string } | null;
}

// Storage is written first. Metadata is canonical and is never inserted for a failed upload.
export async function uploadScorecardEvidence(client: any, input: { userId: string; sessionId: string; courseNumber: number | null; file: File }) {
  const validation = validateScorecardEvidenceFile(input.file); if (validation) throw new Error(validation);
  const path = scorecardEvidencePath(input.userId, input.sessionId, input.file.type);
  const uploaded = await client.storage.from(SCORECARD_EVIDENCE_BUCKET).upload(path, input.file, { contentType: input.file.type, upsert: false });
  if (uploaded.error) throw uploaded.error;
  const inserted = await client.from("competition_scorecard_evidence").insert({ session_id: input.sessionId, user_id: input.userId, course_number: input.courseNumber, storage_path: path, original_filename: input.file.name, content_type: input.file.type, size_bytes: input.file.size }).select("*").single();
  if (inserted.error || !inserted.data) {
    await removeWithOneRetry(client, path);
    throw inserted.error || new Error("Evidence metadata could not be saved.");
  }
  return inserted.data as ScorecardEvidence;
}

export async function reassignScorecardEvidence(client: any, evidenceId: string, courseNumber: number | null, now = new Date().toISOString()) {
  const result = await client.from("competition_scorecard_evidence").update({ course_number: courseNumber, updated_at: now }).eq("id", evidenceId).select("*").single();
  if (result.error || !result.data) throw result.error || new Error("Photo assignment could not be saved.");
  return result.data as ScorecardEvidence;
}

export async function replaceScorecardEvidence(client: any, evidence: ScorecardEvidence, file: File, now = new Date().toISOString()) {
  const validation = validateScorecardEvidenceFile(file); if (validation) throw new Error(validation);
  const newPath = scorecardEvidencePath(evidence.user_id, evidence.session_id, file.type);
  const uploaded = await client.storage.from(SCORECARD_EVIDENCE_BUCKET).upload(newPath, file, { contentType: file.type, upsert: false });
  if (uploaded.error) throw uploaded.error;
  const updated = await client.from("competition_scorecard_evidence").update({ storage_path: newPath, original_filename: file.name, content_type: file.type, size_bytes: file.size, updated_at: now }).eq("id", evidence.id).select("*").single();
  if (updated.error || !updated.data) {
    await removeWithOneRetry(client, newPath);
    throw updated.error || new Error("Replacement could not be saved.");
  }
  const cleanupError = await removeWithOneRetry(client, evidence.storage_path);
  return { evidence: updated.data as ScorecardEvidence, cleanupWarning: cleanupError ? "Photo replaced, but cleanup of the previous private file could not be completed." : undefined };
}

export async function deleteScorecardEvidence(client: any, evidence: ScorecardEvidence) {
  const deleted = await client.from("competition_scorecard_evidence").delete().eq("id", evidence.id);
  if (deleted.error) throw deleted.error;
  const cleanupError = await removeWithOneRetry(client, evidence.storage_path);
  return { metadataDeleted: true as const, cleanupWarning: cleanupError ? "Photo was removed from the Competition, but cleanup of the private stored file could not be completed." : undefined };
}

export function createEvidenceMutationGuard() {
  let active = false;
  return { get active() { return active; }, async run<T>(operation: () => Promise<T>): Promise<T | undefined> { if (active) return undefined; active = true; try { return await operation(); } finally { active = false; } } };
}
