import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

execSync("rm -rf .competition-live-test-build && npx tsc lib/scoreSheets/core.ts lib/scoreSheets/kind.ts lib/scoreSheets/drafts.ts lib/scoreSheets/compak.ts lib/scoreSheets/policy.ts lib/scoreSheets/liveSafety.ts lib/fitasc/compakSchemes.ts --ignoreConfig --module NodeNext --moduleResolution NodeNext --target ES2022 --outDir .competition-live-test-build --skipLibCheck", { stdio: "inherit" });
const core = await import("../.competition-live-test-build/scoreSheets/core.js");
const kinds = await import("../.competition-live-test-build/scoreSheets/kind.js");
const drafts = await import("../.competition-live-test-build/scoreSheets/drafts.js");
const policy = await import("../.competition-live-test-build/scoreSheets/policy.js");
const compak = await import("../.competition-live-test-build/scoreSheets/compak.js");
const safety = await import("../.competition-live-test-build/scoreSheets/liveSafety.js");

assert.equal(kinds.parseScoreSheetKind("competition"), "competition");
assert.equal(policy.canSaveCompetitionScoreSheet("competition"), true);
assert.equal(policy.canSaveCompetitionScoreSheet("training"), false);
assert.equal(policy.canSaveCompetitionScoreSheet("shared_training"), false);
assert.equal(policy.canSaveTrainingScoreSheet("competition"), false);

let results = {};
results = core.toggleTargetResult(results, "shooter", 1, 1); assert.equal(results.shooter[1][1], "hit");
results = core.toggleTargetResult(results, "shooter", 1, 1); assert.equal(results.shooter[1][1], "miss");
results = core.toggleTargetResult(results, "shooter", 1, 1); assert.equal(results.shooter?.[1]?.[1], undefined);
assert.equal(core.targetResultUpsertKey("sheet", "shooter", 1, 2), "sheet:shooter:1:2");
assert.equal(core.getTotalExpectedTargets({ postCount: 2, targetsPerPost: 10, expectedTargetsByPost: [12, 8] }), 20);
const persisted = [
  { id: "valid-11", shooter_id: "s", post_number: 1, target_number: 11 },
  { id: "valid-12", shooter_id: "s", post_number: 1, target_number: 12 },
  { id: "outside-9", shooter_id: "s", post_number: 2, target_number: 9 },
];
const currentKeys = new Set(["s:1:11", "s:1:12", "s:2:9"]);
assert.deepEqual(safety.targetResultIdsToDelete(persisted, ["s"], currentKeys, { postCount: 2, targetsPerPost: 10, expectedTargetsByPost: [12, 8] }), ["outside-9"]);
assert.equal(compak.compakPhysicalTargetCount("report_pair"), 2);
const sequences = compak.buildCompakStandSequences(1, 1, [{ scheme_number: 1, plate_number: 1, event_number: 1, presentation: "report_pair", first_machine: "A", second_machine: "B", is_verified: true }]);
assert.equal(sequences[0].targets.length, 2);
assert.deepEqual(compak.plateRotation(4), [4, 5, 1, 2, 3]);
assert.deepEqual(compak.orderedShootersForPost(["a", "b", "c"], 2), ["b", "c", "a"]);

const synced = JSON.stringify({ sessionType: "competition", synced: true, dirty: false, updatedAt: "2026-01-01T00:00:00Z" });
const dirty = JSON.stringify({ sessionType: "competition", synced: false, dirty: true, updatedAt: "2026-01-01T00:00:00Z" });
assert.notEqual(drafts.scoreSheetDraftKey("competition", "same"), drafts.scoreSheetDraftKey("training", "same"));
assert.equal(drafts.draftHasPendingRecovery(synced, "competition"), false);
assert.equal(drafts.draftHasPendingRecovery(dirty, "competition"), true);
assert.equal(drafts.draftHasPendingRecovery("broken", "competition"), false);
assert.equal(drafts.draftHasPendingRecovery(JSON.stringify({ sessionType: "training", synced: false }), "competition"), false);
const old = Date.parse("2026-08-09T00:00:00Z");
assert.equal(drafts.shouldAgeOutSyncedDraft(drafts.scoreSheetDraftKey("competition", "old"), synced, old, 1), true);
assert.equal(drafts.shouldAgeOutSyncedDraft(drafts.scoreSheetDraftKey("competition", "dirty"), dirty, old, 1), false);
assert.equal(safety.syncBlockedByRecovery(true, false), true);
assert.equal(safety.syncBlockedByRecovery(false, true), true);
assert.equal(safety.syncBlockedByRecovery(false, false), false);
assert.equal(safety.syncActionLabel("saved_local"), "Sync now");
assert.equal(safety.syncActionLabel("sync_failed"), "Retry sync");
assert.equal(safety.serverChangedSinceDraft({ baseServerUpdatedAt: "T1", draftUpdatedAt: "2099-01-01T00:00:00Z", serverUpdatedAt: "T1" }), false);
assert.equal(safety.serverChangedSinceDraft({ baseServerUpdatedAt: "T1", draftUpdatedAt: "2099-01-01T00:00:00Z", serverUpdatedAt: "T2" }), true, "client clock cannot override a server revision mismatch");
assert.equal(safety.serverChangedSinceDraft({ draftUpdatedAt: "2026-08-09T12:00:00Z", serverUpdatedAt: "2026-08-09T11:00:00Z" }), false, "legacy newer local draft fallback remains supported");
assert.equal(safety.serverChangedSinceDraft({ draftUpdatedAt: "2026-08-09T10:00:00Z", serverUpdatedAt: "2026-08-09T11:00:00Z" }), true, "legacy newer server fallback remains supported");
assert.equal(safety.formatDateOnly("2026-08-09"), "9 Aug 2026");
assert.equal(safety.deleteScoreSheetConfirmation("competition"), "Delete this competition score sheet? This will remove shooters, scores, and target results. This cannot be undone.");
assert.equal(policy.scoreSheetCountsAsTraining("competition"), false);
assert.equal(policy.shouldCreatePersonalSessionForScoreSheet("competition"), false);

const editor = readFileSync("app/components/scoreSheets/ScoreSheetEditor.tsx", "utf8");
const competitionRoute = readFileSync("app/competition-score-sheets/[id]/page.tsx", "utf8");
const trainingRoute = readFileSync("app/training-score-sheets/[id]/page.tsx", "utf8");
const competitionList = readFileSync("app/competition-score-sheets/page.tsx", "utf8");
const revisionMigration = readFileSync("supabase/migrations/20260809120000_training_score_sheet_monotonic_revision.sql", "utf8");
const sqlRegression = readFileSync("supabase/tests/competition_score_sheet_live.sql", "utf8");
assert.match(competitionRoute, /kind="competition"/);
assert.match(trainingRoute, /kind="training"/);
assert.match(editor, /isCompetition \? \["competition"\] : \["training", "shared_training"\]/);
assert.match(editor, /\.eq\("updated_at", lastKnownServerUpdatedAt/);
assert.match(editor, /if \(!sheetError && existingSheetId && !savedSheet\)[\s\S]*return null;[\s\S]*if \(sheetError \|\| !savedSheet\)[\s\S]*setPersistedSheetId/, "conflict returns before child writes");
assert.match(editor, /if \(!isCompetition\) void recordAnalyticsEvent/, "Competition skips Training analytics");
assert.match(competitionList, /draftHasPendingRecovery/);
assert.match(revisionMigration, /greatest\([\s\S]*clock_timestamp\(\)[\s\S]*old\.updated_at \+ interval '1 microsecond'/);
assert.match(revisionMigration, /before update on public\.training_score_sheets/);
for (const proof of ["parent revision did not advance from T1 to T2", "stale T1 revision updated the parent", "current T2 revision did not update exactly one row", "parent revision did not advance from T2 to T3"]) assert.match(sqlRegression, new RegExp(proof));
assert.equal(existsSync("lib/competitionScoring.ts"), false);
assert.doesNotMatch(editor, /\.from\("sessions"\)/);
assert.match(readFileSync("app/stats/page.tsx", "utf8"), /\["training", "shared_training"\]/);

execSync("rm -rf .competition-live-test-build");
console.log("Competition Score Sheet live tests passed.");
