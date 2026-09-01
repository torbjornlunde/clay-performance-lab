import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";

await rm(new URL("../.score-sheet-offline-test-build/", import.meta.url), { recursive: true, force: true });
execFileSync(process.execPath, [
  "node_modules/typescript/bin/tsc",
  "lib/scoreSheets/kind.ts",
  "lib/scoreSheets/offlineSync.ts",
  "lib/scoreSheets/competitionLifecycle.ts",
  "--ignoreConfig",
  "--module", "NodeNext",
  "--moduleResolution", "NodeNext",
  "--target", "ES2022",
  "--outDir", ".score-sheet-offline-test-build",
  "--skipLibCheck",
], { stdio: "inherit" });
const offline = await import("../.score-sheet-offline-test-build/offlineSync.js");
const lifecycle = await import("../.score-sheet-offline-test-build/competitionLifecycle.js");

assert.equal(offline.scoreSheetSyncMessage({ online: true, status: "synced", hasPendingLocalWork: false }), "Online · All changes synced");
assert.equal(offline.scoreSheetSyncMessage({ online: true, status: "saved_local", hasPendingLocalWork: true }), "Online · Changes waiting to sync");
assert.equal(offline.scoreSheetSyncMessage({ online: false, status: "offline", hasPendingLocalWork: true }), "Offline mode · Saved on this device");
assert.equal(offline.scoreSheetSyncMessage({ online: true, status: "syncing", hasPendingLocalWork: true }), "Syncing…");
assert.equal(offline.scoreSheetSyncMessage({ online: true, status: "sync_failed", hasPendingLocalWork: true }), "Sync failed · Tap to retry");
assert.equal(offline.scoreSheetSyncMessage({ online: true, status: "conflict", hasPendingLocalWork: true }), "Conflict · Review before syncing");

const reconnect = { online: true, documentVisible: true, hasPendingLocalWork: true, needsServerRefresh: false, saving: false, recoveryBlocked: false, status: "sync_failed" };
assert.equal(offline.shouldAttemptScoreSheetReconnect(reconnect), true, "foreground reconnect retries pending work after a failed sync");
assert.equal(offline.shouldAttemptScoreSheetReconnect({ ...reconnect, hasPendingLocalWork: false, needsServerRefresh: true, status: "offline" }), true, "a synced offline snapshot refreshes from the server on reconnect");
assert.equal(offline.shouldAttemptScoreSheetReconnect({ ...reconnect, online: false }), false);
assert.equal(offline.shouldAttemptScoreSheetReconnect({ ...reconnect, documentVisible: false }), false);
assert.equal(offline.shouldAttemptScoreSheetReconnect({ ...reconnect, status: "conflict" }), false, "conflicts never auto-overwrite");
assert.equal(offline.shouldAttemptScoreSheetReconnect({ ...reconnect, saving: true }), false, "only one sync runs at a time");

const eligibleDraft = { draftOwnerUserId: "owner", cachedUserId: "owner", draftScoreSheetId: "sheet", routeScoreSheetId: "sheet", draftKind: "training", routeKind: "training" };
assert.equal(offline.canRestoreOfflineScoreSheetDraft(eligibleDraft), true, "the same signed-in user can reopen a cached Training sheet");
assert.equal(offline.canRestoreOfflineScoreSheetDraft({ ...eligibleDraft, draftKind: "shared_training" }), true, "shared Training uses the same recovery architecture");
assert.equal(offline.canRestoreOfflineScoreSheetDraft({ ...eligibleDraft, draftOwnerUserId: "other" }), false, "another user's draft is never restored");
assert.equal(offline.canRestoreOfflineScoreSheetDraft({ ...eligibleDraft, draftOwnerUserId: undefined }), false, "legacy unbound drafts are not exposed through offline-only auth");
assert.equal(offline.canRestoreOfflineScoreSheetDraft({ ...eligibleDraft, draftScoreSheetId: "other-sheet" }), false);
assert.equal(offline.canRestoreOfflineScoreSheetDraft({ ...eligibleDraft, draftKind: "competition" }), false);

assert.equal(offline.scoreSheetSyncFailureIsConflict({ revisionMatchMissing: true }), true);
assert.equal(offline.scoreSheetSyncFailureIsConflict({ errorMessage: "Finalized Competition Score Sheets are read-only." }), true);
assert.equal(offline.scoreSheetSyncFailureIsConflict({ errorMessage: "Failed to fetch" }), false);

const cleanCompetition = { online: true, hasUnsyncedLocalDraft: false, localSaveStatus: "synced", recoveryPrompt: false, recoveryAutosavePaused: false, saving: false, lastKnownServerUpdatedAt: "T1", shooterCount: 1 };
assert.equal(lifecycle.competitionFinalizeBlockReason({ ...cleanCompetition, online: false }), "Connect to the internet and sync this score sheet before finalizing.");
assert.ok(lifecycle.competitionFinalizeBlockReason({ ...cleanCompetition, hasUnsyncedLocalDraft: true }), "Competition cannot finalize before local work is synced");

const editor = readFileSync("app/components/scoreSheets/ScoreSheetEditor.tsx", "utf8");
assert.match(editor, /ownerUserId:\s*ownerUserIdRef\.current/, "offline snapshots are bound to the current user");
assert.match(editor, /restoreOfflineSnapshot\(cachedDraft,[\s\S]*setLocalDraftLoaded\(true\)/, "reload can hydrate the editor from the device snapshot");
assert.match(editor, /document\.addEventListener\("visibilitychange", handleVisibilityChange\)/, "foreground return attempts reconnect sync");
assert.match(editor, /setLocalSaveStatus\("conflict"\)/, "stale revisions have a distinct conflict state");
assert.match(editor, /function reviewSyncConflict\(\)[\s\S]*setRecoveryAutosavePaused\(true\)[\s\S]*writeLocalDraft\(false\)[\s\S]*loadScoreSheet\(\)/, "conflict review preserves the local draft before loading the server version into recovery");
assert.match(editor, /localSaveStatus === "conflict"[\s\S]*onClick=\{reviewSyncConflict\}[\s\S]*Review conflict/, "the conflict banner exposes its safe review action");
assert.match(editor, /writeLocalDraft\(false, savedSheet\.id, savedSheet\.updated_at\)/, "partial-save retry keeps the advanced server revision as its safe base");
assert.match(editor, /\.eq\("updated_at", lastKnownServerUpdatedAt \|\| ""\)[\s\S]*if \(!sheetError && existingSheetId && !savedSheet\)[\s\S]*return null;[\s\S]*training_score_sheet_shooters/, "stale parent writes stop before child rows are touched");
for (const conflictKey of ["id", "score_sheet_id,shooter_id,post_number", "score_sheet_id,shooter_id,post_number,target_number"]) {
  assert.ok(editor.includes(`onConflict: "${conflictKey}"`), `retry upserts remain idempotent for ${conflictKey}`);
}
assert.match(editor, /if \(!isOnline \|\| !navigator\.onLine\)[\s\S]*Reopening is server-authoritative and requires an internet connection/, "Competition reopen is explicitly online-only");
assert.match(editor, /competitionStatus,[\s\S]*competitionReopenCount/, "Competition lifecycle state survives an offline reopen");

await rm(new URL("../.score-sheet-offline-test-build/", import.meta.url), { recursive: true, force: true });
console.log("Score Sheet offline resilience tests passed.");
