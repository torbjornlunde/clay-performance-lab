export const COMPETITION_STATUSES = ["live", "finalized"] as const;
export type CompetitionStatus = (typeof COMPETITION_STATUSES)[number];

export function parseCompetitionStatus(value: unknown): CompetitionStatus {
  if (value === "live" || value === "finalized") return value;
  throw new Error(`Invalid Competition status: ${String(value)}`);
}

export function competitionStatusForKind(kind: "training" | "shared_training" | "competition", value: unknown) {
  return kind === "competition" ? parseCompetitionStatus(value ?? "live") : null;
}

export function competitionIsReadOnly(kind: string, status: CompetitionStatus | null) {
  return kind === "competition" && status === "finalized";
}

export function competitionFinalizeBlockReason(options: {
  online: boolean; hasUnsyncedLocalDraft: boolean; localSaveStatus: string;
  recoveryPrompt: boolean; recoveryAutosavePaused: boolean; saving: boolean;
  lastKnownServerUpdatedAt: string | null; shooterCount: number;
}) {
  if (!options.online) return "Connect to the internet and sync this score sheet before finalizing.";
  if (options.shooterCount < 1) return "Add and save at least one shooter before finalizing.";
  if (options.hasUnsyncedLocalDraft || ["saved_local", "offline", "syncing", "sync_failed"].includes(options.localSaveStatus)) return "Sync all local scoring changes before finalizing.";
  if (options.recoveryPrompt || options.recoveryAutosavePaused) return "Resolve the local recovery choice before finalizing.";
  if (options.saving) return "Wait for the current save to finish before finalizing.";
  if (!options.lastKnownServerUpdatedAt) return "Save and sync this score sheet before finalizing.";
  return null;
}

export function competitionCoverage(shooterIds: string[], expectedTargets: number, targetResults: Record<string, Record<number, Record<number, unknown>>>) {
  const expected = Math.max(0, Math.trunc(expectedTargets)) * shooterIds.length;
  const scored = shooterIds.reduce((sum, id) => sum + Object.values(targetResults[id] || {}).reduce((postSum, rows) => postSum + Object.keys(rows).length, 0), 0);
  return { expected, scored, unscored: Math.max(expected - scored, 0), complete: expected > 0 && scored === expected };
}
