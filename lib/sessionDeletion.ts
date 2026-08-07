import { SCORECARD_EVIDENCE_BUCKET } from "@/lib/scorecardEvidence";

/** Deletes the canonical session first; evidence objects are only cleaned afterwards. */
export async function deleteSessionWithEvidenceCleanup(client: any, sessionId: string) {
  const evidence = await client.from("competition_scorecard_evidence").select("storage_path").eq("session_id", sessionId);
  if (evidence.error) throw evidence.error;
  const deleted = await client.from("sessions").delete().eq("id", sessionId);
  if (deleted.error) throw deleted.error;
  const paths = (evidence.data || []).map((row: { storage_path: string }) => row.storage_path);
  if (paths.length) {
    const cleanup = await client.storage.from(SCORECARD_EVIDENCE_BUCKET).remove(paths);
    if (cleanup.error) console.warn("Session deleted; scorecard evidence orphan cleanup failed.", cleanup.error);
  }
}
