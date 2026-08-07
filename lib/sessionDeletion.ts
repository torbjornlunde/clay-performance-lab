import { SCORECARD_EVIDENCE_BUCKET } from "./scorecardEvidence";

/** Canonical session deletion always precedes best-effort private object cleanup. */
export async function deleteSessionWithEvidenceCleanup(client: any, sessionId: string) {
  const evidence = await client.from("competition_scorecard_evidence").select("storage_path").eq("session_id", sessionId);
  if (evidence.error) throw evidence.error;
  const deleted = await client.from("sessions").delete().eq("id", sessionId);
  if (deleted.error) throw deleted.error;
  const paths = (evidence.data || []).map((row: { storage_path: string }) => row.storage_path);
  if (!paths.length) return { sessionDeleted: true as const };
  let cleanup = await client.storage.from(SCORECARD_EVIDENCE_BUCKET).remove(paths);
  if (cleanup.error) cleanup = await client.storage.from(SCORECARD_EVIDENCE_BUCKET).remove(paths);
  const cleanupWarning = cleanup.error ? "Session was deleted, but cleanup of private scorecard files could not be completed." : undefined;
  if (cleanupWarning) console.warn(cleanupWarning, cleanup.error);
  return { sessionDeleted: true as const, cleanupWarning };
}
