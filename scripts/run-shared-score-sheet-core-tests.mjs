import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

execSync('rm -rf .shared-score-sheet-test-build && npx tsc lib/scoreSheets/core.ts lib/scoreSheets/kind.ts lib/scoreSheets/drafts.ts lib/scoreSheets/compak.ts lib/scoreSheets/policy.ts lib/fitasc/compakSchemes.ts --ignoreConfig --module NodeNext --moduleResolution NodeNext --target ES2022 --outDir .shared-score-sheet-test-build --skipLibCheck', { stdio: 'inherit' });
const core = await import('../.shared-score-sheet-test-build/scoreSheets/core.js');
const kinds = await import('../.shared-score-sheet-test-build/scoreSheets/kind.js');
const drafts = await import('../.shared-score-sheet-test-build/scoreSheets/drafts.js');
const compak = await import('../.shared-score-sheet-test-build/scoreSheets/compak.js');
const policy = await import('../.shared-score-sheet-test-build/scoreSheets/policy.js');

// Kinds, Training-route eligibility, save defense, and exhaustive labels.
for (const kind of ['training', 'shared_training', 'competition']) assert.equal(kinds.parseScoreSheetKind(kind), kind);
assert.throws(() => kinds.parseScoreSheetKind('invalid'));
assert.equal(kinds.isTrainingScoreSheetKind('training'), true);
assert.equal(kinds.isTrainingScoreSheetKind('shared_training'), true);
assert.equal(kinds.isTrainingScoreSheetKind('competition'), false);
assert.equal(policy.canSaveTrainingScoreSheet('training'), true);
assert.equal(policy.canSaveTrainingScoreSheet('shared_training'), true);
assert.equal(policy.canSaveTrainingScoreSheet('competition'), false);
assert.equal(kinds.scoreSheetKindLabel('training'), 'Training');
assert.equal(kinds.scoreSheetKindLabel('shared_training'), 'Shared training');
assert.equal(kinds.scoreSheetKindLabel('competition'), 'Competition');

// Kind-aware draft identity and backward-compatible Training recovery.
assert.equal(drafts.scoreSheetDraftKey('training', 'same'), 'training_score_sheet_draft:same');
assert.equal(drafts.scoreSheetDraftKey('competition', 'same'), 'score_sheet_draft:competition:same');
assert.notEqual(drafts.scoreSheetDraftKey('training', 'same'), drafts.scoreSheetDraftKey('competition', 'same'));
assert.equal(drafts.scoreSheetKindFromDraft(undefined), 'training');
assert.equal(drafts.scoreSheetKindFromDraft('training'), 'training');
assert.equal(drafts.scoreSheetKindFromDraft('shared_training'), 'shared_training');
assert.equal(drafts.scoreSheetKindFromDraft('competition'), 'competition');
assert.equal(drafts.scoreSheetKindFromDraft('invalid'), null);
assert.equal(drafts.canRestoreDraftInTraining(undefined), true);
assert.equal(drafts.canRestoreDraftInTraining('training'), true);
assert.equal(drafts.canRestoreDraftInTraining('shared_training'), true);
assert.equal(drafts.canRestoreDraftInTraining('competition'), false);
assert.equal(drafts.canRestoreDraftInTraining('invalid'), false);
const values = new Map([[drafts.legacyTrainingDraftKey('old'), JSON.stringify({ version: 1, sheetId: 'old' })]]);
const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
const parseLegacyTraining = raw => {
  if (!raw) return null;
  const value = JSON.parse(raw);
  const sessionType = drafts.scoreSheetKindFromDraft(value.sessionType);
  return sessionType && drafts.canRestoreDraftInTraining(sessionType) ? { ...value, sessionType } : null;
};
assert.deepEqual(drafts.migrateLegacyTrainingDraft(storage, 'old', parseLegacyTraining), { version: 1, sheetId: 'old', sessionType: 'training' });
assert.ok(values.has(drafts.scoreSheetDraftKey('training', 'old')));
assert.ok(!values.has(drafts.legacyTrainingDraftKey('old')));
assert.deepEqual(parseLegacyTraining(JSON.stringify({ version: 1, sheetId: 'shared', sessionType: 'shared_training' })).sessionType, 'shared_training');
assert.equal(parseLegacyTraining(JSON.stringify({ version: 1, sheetId: 'competition', sessionType: 'competition' })), null);
assert.equal(parseLegacyTraining(JSON.stringify({ version: 1, sheetId: 'bad', sessionType: 'invalid' })), null);

// Existing shared score semantics.
let results = {};
results = core.toggleTargetResult(results, 'shooter', 1, 1); assert.equal(results.shooter[1][1], 'hit');
results = core.toggleTargetResult(results, 'shooter', 1, 1); assert.equal(results.shooter[1][1], 'miss');
results = core.toggleTargetResult(results, 'shooter', 1, 1); assert.equal(results.shooter?.[1]?.[1], undefined);
assert.equal(core.targetResultUpsertKey('sheet', 'shooter', 1, 2), 'sheet:shooter:1:2');
const retry = { score_sheet_id: 'sheet', shooter_id: 'shooter', post_number: 1, target_number: 1, result: 'hit' };
assert.equal(core.deduplicateTargetResultWrites([retry, retry]).length, 1);
const detailed = { a: { 1: { 1: 'hit', 2: 'miss' }, 2: { 1: 'hit' } }, b: { 1: { 1: 'hit', 2: 'hit' } } };
assert.equal(core.displayedPostScore({ localId: 'a', scores: [0, 0] }, 0, detailed), 1);
assert.equal(core.totalFor({ localId: 'a', scores: [0, 0] }, detailed), 2);
assert.deepEqual(core.scoreSheetCompletionStatus(detailed, ['a', 'b'], { postCount: 2, targetsPerPost: 2, expectedTargetsByPost: [2, 1] }), { expectedEntries: 6, scoredEntries: 5, remainingEntries: 1, complete: false });
assert.equal(core.scoreFromTargetResults({ a: { 1: { 1: 'hit' } } }, 'a', 1), 1, 'unknown target is not an automatic miss');
assert.equal(core.getTotalExpectedTargets({ postCount: 3, targetsPerPost: 10, expectedTargetsByPost: [8, 10, 6] }), 24);

// Existing Compak physical-target, sequence, and rotation behavior.
assert.equal(compak.compakPhysicalTargetCount('report_pair'), 2);
const sequences = compak.buildCompakStandSequences(1, 1, [{ scheme_number: 1, plate_number: 1, event_number: 1, presentation: 'report_pair', first_machine: 'A', second_machine: 'B', is_verified: true }]);
assert.equal(sequences[0].targets.length, 2);
assert.deepEqual(sequences[0].targets.map(target => target.targetNumber), [1, 2]);
assert.deepEqual(compak.plateRotation(4), [4, 5, 1, 2, 3]);
assert.equal(compak.compakStartPlateForOrderNumber(6, 'waiting_shooter'), 1);
assert.equal(compak.compakStartPlateForOrderNumber(6, 'continuous_rotation'), 1);
assert.deepEqual(compak.orderedShootersForPost(['a', 'b', 'c'], 2), ['b', 'c', 'a']);

// Statistics/session separation and ownership policy decisions.
assert.equal(policy.scoreSheetCountsAsTraining('competition'), false);
assert.equal(policy.scoreSheetCountsAsTraining('training'), true);
assert.equal(policy.shouldCreatePersonalSessionForScoreSheet('competition'), false);
assert.equal(policy.canWriteOwnedScoreSheet('owner', 'owner'), true);
assert.equal(policy.canWriteOwnedScoreSheet('other', 'owner'), false);

// Focused integration wiring assertions.
const trainingRoute = readFileSync('app/training-score-sheets/[id]/page.tsx', 'utf8');
const competitionRoute = readFileSync('app/competition-score-sheets/[id]/page.tsx', 'utf8');
const editor = readFileSync('app/components/scoreSheets/ScoreSheetEditor.tsx', 'utf8');
assert.match(trainingRoute, /ScoreSheetEditor kind="training"/);
assert.match(competitionRoute, /ScoreSheetEditor kind="competition"/);
assert.match(editor, /@\/lib\/scoreSheets\/core/);
assert.doesNotMatch(editor, /competitionScoring/);
assert.match(editor, /isCompetition \? \["competition"\] : \["training", "shared_training"\]/);
assert.match(editor, /sessionType !== "competition"/);
const list = readFileSync('app/training-score-sheets/page.tsx', 'utf8'); assert.match(list, /\.in\("session_type", \["training", "shared_training"\]\)/);
const stats = readFileSync('app/stats/page.tsx', 'utf8'); assert.match(stats, /\.in\("session_type", \["training", "shared_training"\]\)/);
const dashboard = readFileSync('app/dashboard/page.tsx', 'utf8'); assert.match(dashboard, /\.in\("session_type", \["training", "shared_training"\]\)/);
const migration = readFileSync('supabase/migrations/20260807180000_shared_score_sheet_kind.sql', 'utf8'); assert.match(migration, /training.*shared_training.*competition/);
const sql = readFileSync('supabase/tests/shared_score_sheet_kind.sql', 'utf8');
for (const proof of ['cross-user sheet insert allowed', 'cross-user sheet update allowed', 'cross-user sheet delete allowed', 'cross-user shooter insert allowed', 'cross-user target insert allowed', 'cross-user target update allowed', 'cross-user target delete allowed', 'retry duplicated target result', 'broad RLS']) assert.match(sql, new RegExp(proof));

execSync('rm -rf .shared-score-sheet-test-build');
console.log('Shared score-sheet core tests passed.');
