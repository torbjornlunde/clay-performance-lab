import { getExpectedTargetsForPost, type ExpectedTargetSetup } from "./core";

export function syncBlockedByRecovery(recoveryPromptExists: boolean, recoveryAutosavePaused: boolean) {
  return recoveryPromptExists || recoveryAutosavePaused;
}

export function syncActionLabel(status: "saved_local" | "sync_failed" | string) {
  return status === "sync_failed" ? "Retry sync" : "Sync now";
}

export type PersistedTargetPosition = { id: string; shooter_id: string; post_number: number; target_number: number };
export function targetResultIdsToDelete(rows: PersistedTargetPosition[], keptShooterIds: string[], currentTargetKeys: Set<string>, setup: ExpectedTargetSetup) {
  return rows.filter((row) => {
    if (!keptShooterIds.includes(row.shooter_id)) return false;
    const outsideSetup = row.post_number < 1 || row.post_number > setup.postCount || row.target_number < 1 || row.target_number > getExpectedTargetsForPost(setup, row.post_number);
    const stale = !currentTargetKeys.has(`${row.shooter_id}:${row.post_number}:${row.target_number}`);
    return outsideSetup || stale;
  }).map((row) => row.id);
}

export function formatDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return `${match[2]}/${match[3]}/${match[1]}`;
}

export function deleteScoreSheetConfirmation(kind: "training" | "competition") {
  return `Delete this ${kind} score sheet? This will remove shooters, scores, and target results. This cannot be undone.`;
}
