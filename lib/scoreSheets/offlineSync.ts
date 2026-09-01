import { isTrainingScoreSheetKind, type ScoreSheetKind } from "./kind";

export type ScoreSheetLocalSaveStatus =
  | "idle"
  | "saved_local"
  | "syncing"
  | "synced"
  | "sync_failed"
  | "conflict"
  | "offline"
  | "local_save_failed";

export function scoreSheetSyncMessage(options: {
  online: boolean;
  status: ScoreSheetLocalSaveStatus;
  hasPendingLocalWork: boolean;
}) {
  if (options.status === "local_save_failed") return "Local save failed · Keep this sheet open";
  if (options.status === "conflict") return "Conflict · Review before syncing";
  if (options.status === "syncing") return "Syncing…";
  if (!options.online) return "Offline mode · Saved on this device";
  if (options.status === "sync_failed") return "Sync failed · Tap to retry";
  if (options.hasPendingLocalWork || options.status === "saved_local") return "Online · Changes waiting to sync";
  return "Online · All changes synced";
}

export function shouldAttemptScoreSheetReconnect(options: {
  online: boolean;
  documentVisible: boolean;
  hasPendingLocalWork: boolean;
  needsServerRefresh: boolean;
  saving: boolean;
  recoveryBlocked: boolean;
  status: ScoreSheetLocalSaveStatus;
}) {
  return Boolean(
    options.online &&
    options.documentVisible &&
    (options.hasPendingLocalWork || options.needsServerRefresh) &&
    !options.saving &&
    !options.recoveryBlocked &&
    options.status !== "conflict" &&
    options.status !== "local_save_failed",
  );
}

export function canRestoreOfflineScoreSheetDraft(options: {
  draftOwnerUserId: string | null | undefined;
  cachedUserId: string | null | undefined;
  draftScoreSheetId: string | null | undefined;
  routeScoreSheetId: string;
  draftKind: ScoreSheetKind;
  routeKind: ScoreSheetKind;
}) {
  const sameKind = options.routeKind === "competition"
    ? options.draftKind === "competition"
    : isTrainingScoreSheetKind(options.routeKind) && isTrainingScoreSheetKind(options.draftKind);
  return Boolean(
    options.cachedUserId &&
    options.draftOwnerUserId === options.cachedUserId &&
    options.draftScoreSheetId === options.routeScoreSheetId &&
    sameKind,
  );
}

export function scoreSheetSyncFailureIsConflict(options: {
  revisionMatchMissing?: boolean;
  errorMessage?: string | null;
}) {
  if (options.revisionMatchMissing) return true;
  const message = options.errorMessage?.toLowerCase() || "";
  return message.includes("revision conflict") ||
    message.includes("finalized competition score sheets are read-only") ||
    message.includes("must be reopened");
}
