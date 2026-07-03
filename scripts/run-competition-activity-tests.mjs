import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';

execSync('rm -rf .competition-activity-test-build && npx tsc lib/competitionActivity.ts --ignoreConfig --module NodeNext --moduleResolution NodeNext --target ES2022 --lib ES2022,DOM --outDir .competition-activity-test-build --skipLibCheck', { stdio: 'inherit' });
const { buildCompetitionActivitySummary } = await import('../.competition-activity-test-build/competitionActivity.js');

const rows = [
  { id: 'detailed-2026', session_type: 'Competition', total_targets: 100, competition_date: '2026-06-10', created_at: '2026-06-11T00:00:00Z' },
  { id: 'result-only-2025', session_type: 'Competition', total_targets: 50, competition_date: '2025-05-01', created_at: '2025-05-02T00:00:00Z' },
  { id: 'leirdue-import-canonical', session_type: 'Competition', total_targets: 25, competition_date: '2026-04-01', created_at: '2026-04-02T00:00:00Z' },
  { id: 'scorecard-import-canonical', session_type: 'Competition', total_targets: 75, competition_date: null, created_at: '2024-03-01T00:00:00Z' },
  { id: 'unknown-targets', session_type: 'Competition', total_targets: null, competition_date: '2026-07-01', created_at: '2026-07-01T00:00:00Z' },
  { id: 'training', session_type: 'Training', total_targets: 999, competition_date: '2026-01-01', created_at: '2026-01-01T00:00:00Z' },
  { id: 'training-score-sheet-like', session_type: 'training_score_sheet', total_targets: 999, competition_date: '2026-01-02', created_at: '2026-01-02T00:00:00Z' },
];

const summary2026 = buildCompetitionActivitySummary(rows, 2026);
assert.equal(summary2026.allTimeCompetitionCount, 5, 'detailed/result-only/imported canonical competition sessions are counted once each');
assert.equal(summary2026.allTimeCompetitionTargetCount, 250, 'known all-time competition targets are summed without inventing unknown targets');
assert.equal(summary2026.selectedYearCompetitionCount, 3, 'current-year filtering includes only competitions in selected year');
assert.equal(summary2026.selectedYearCompetitionTargetCount, 125, 'selected-year targets sum known competition totals only');
assert.equal(summary2026.hasUnknownAllTimeTargets, true, 'all-time summary flags unknown target counts');
assert.equal(summary2026.hasUnknownSelectedYearTargets, true, 'selected-year summary flags unknown target counts');
assert.deepEqual(summary2026.years, [2026, 2025, 2024], 'year selector uses years present in canonical competition history');

const summary2025 = buildCompetitionActivitySummary(rows, 2025);
assert.equal(summary2025.selectedYearCompetitionCount, 1, 'another-year filtering uses selected year');
assert.equal(summary2025.selectedYearCompetitionTargetCount, 50, 'another-year target total is isolated');
assert.equal(summary2025.hasUnknownSelectedYearTargets, false, 'known target years do not show unknown target flag');

const withSupportingRecords = buildCompetitionActivitySummary([
  { id: 'canonical-session', session_type: 'Competition', total_targets: 25, competition_date: '2026-01-01', created_at: '2026-01-01T00:00:00Z' },
  // Supporting import/OCR/template records are not session rows and are intentionally absent from the canonical input.
], 2026);
assert.equal(withSupportingRecords.allTimeCompetitionCount, 1, 'supporting import/template records are not counted separately from canonical saved sessions');
assert.equal(withSupportingRecords.allTimeCompetitionTargetCount, 25, 'supporting records do not double count targets');

const empty = buildCompetitionActivitySummary([], 2026);
assert.equal(empty.allTimeCompetitionCount, 0, 'empty history returns zero all-time count');
assert.equal(empty.allTimeCompetitionTargetCount, 0, 'empty history returns zero all-time targets');
assert.equal(empty.selectedYearCompetitionCount, 0, 'empty history returns zero selected-year count');
assert.equal(empty.selectedYearCompetitionTargetCount, 0, 'empty history returns zero selected-year targets');
assert.deepEqual(empty.years, [], 'empty history has no selectable history years');

rmSync('.competition-activity-test-build', { recursive: true, force: true });
console.log('competition activity tests passed');
