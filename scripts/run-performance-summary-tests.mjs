import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';

writeFileSync('.performance-test-tsconfig.json', JSON.stringify({ compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2022', lib: ['ES2022'], types: ['node'], outDir: '.performance-test-build', skipLibCheck: true, rootDir: '.', ignoreDeprecations: '6.0' }, include: ['lib/performance/**/*.ts'] }));
execFileSync('npx', ['tsc', '-p', '.performance-test-tsconfig.json'], { stdio: 'inherit' });
const mod = await import('../.performance-test-build/lib/performance/summary.js');
const today = new Date('2026-07-18T00:00:00');
const rows = [
  { id: 'c-old', date: '2026-03-01', discipline: 'Trap', dataType: 'competition', score: 90, winningScore: 100 },
  { id: 'c-prev', date: '2026-05-01', discipline: 'Trap', dataType: 'competition', score: 88, winningScore: 100 },
  { id: 'c-30', date: '2026-07-01', discipline: 'Trap', dataType: 'competition', score: 92, winningScore: 100 },
  { id: 'c-90', date: '2026-06-01', discipline: 'Skeet', dataType: 'competition', score: 80, winningScore: 100 },
  { id: 't-30', date: '2026-07-10', discipline: 'Trap', dataType: 'training', score: 45, maxScore: 50 },
];

assert.deepEqual(mod.getPeriodBounds('30d', today), { start: '2026-06-19', end: '2026-07-18' }, '30-day period filtering bounds are inclusive');
assert.equal(mod.filterPerformanceResults(rows, { period: '30d', type: 'all', today }).length, 2, '30-day period filtering includes recent competition and training');
assert.equal(mod.filterPerformanceResults(rows, { period: '90d', type: 'competition', today }).length, 3, '90-day period filtering includes competition only');
assert.equal(mod.filterPerformanceResults(rows, { period: 'all', type: 'all', discipline: 'Skeet', today }).length, 1, 'discipline filtering works');
assert.equal(mod.filterPerformanceResults(rows, { period: 'all', type: 'competition', today }).some((row) => row.dataType === 'training'), false, 'competition/training separation is explicit');

const improving = mod.calculatePerformanceSummary(rows, mod.filterPerformanceResults(rows, { period: '30d', type: 'competition', today }), { period: '30d', type: 'competition', today });
assert.equal(improving.trend.label, 'Improving', 'current vs previous period trend detects improvement');
assert.equal(mod.calculateTrend(90, 89).label, 'Stable', 'stable threshold uses ±1.5 percentage points');
assert.equal(mod.calculateTrend(90, null).label, 'Not enough data yet', 'insufficient data is cautious');

const filteredTrendRows = [
  { id: 'leirdue-prev', date: '2026-04-10', discipline: 'Leirduesti', dataType: 'competition', score: 91, winningScore: 100 },
  { id: 'skeet-prev', date: '2026-04-11', discipline: 'Skeet', dataType: 'competition', score: 60, winningScore: 100 },
  { id: 'trap-prev', date: '2026-04-12', discipline: 'Trap', dataType: 'competition', score: 55, winningScore: 100 },
  { id: 'leirdue-now', date: '2026-06-20', discipline: 'Leirduesti', dataType: 'competition', score: 92, winningScore: 100 },
];
const leirdueTrend = mod.calculatePerformanceSummary(
  filteredTrendRows,
  mod.filterPerformanceResults(filteredTrendRows, { period: '90d', type: 'competition', discipline: 'Leirduesti', today }),
  { period: '90d', type: 'competition', discipline: 'Leirduesti', today },
);
assert.equal(leirdueTrend.trend.label, 'Stable', 'previous-period trend preserves the active discipline filter');

const mixedPreviousCompetitionCurrent = [
  { id: 'comp-prev', date: '2026-04-10', discipline: 'Trap', dataType: 'competition', score: 90, winningScore: 100 },
  { id: 'train-prev', date: '2026-04-11', discipline: 'Trap', dataType: 'training', score: 10, maxScore: 100 },
  { id: 'comp-now', date: '2026-06-20', discipline: 'Trap', dataType: 'competition', score: 91, winningScore: 100 },
];
const allCompCurrent = mod.calculatePerformanceSummary(
  mixedPreviousCompetitionCurrent,
  mod.filterPerformanceResults(mixedPreviousCompetitionCurrent, { period: '90d', type: 'all', discipline: 'Trap', today }),
  { period: '90d', type: 'all', discipline: 'Trap', today },
);
assert.equal(allCompCurrent.recentAverage, 91, 'All mode may show a current single-type metric');
assert.equal(allCompCurrent.trend.label, 'Not enough data yet', 'All mode does not compare current Competition against previous mixed data');

const mixedPreviousTrainingCurrent = [
  { id: 'comp-prev', date: '2026-04-10', discipline: 'Trap', dataType: 'competition', score: 90, winningScore: 100 },
  { id: 'train-prev', date: '2026-04-11', discipline: 'Trap', dataType: 'training', score: 10, maxScore: 100 },
  { id: 'train-now', date: '2026-06-20', discipline: 'Trap', dataType: 'training', score: 46, maxScore: 50 },
];
const allTrainingCurrent = mod.calculatePerformanceSummary(
  mixedPreviousTrainingCurrent,
  mod.filterPerformanceResults(mixedPreviousTrainingCurrent, { period: '90d', type: 'all', discipline: 'Trap', today }),
  { period: '90d', type: 'all', discipline: 'Trap', today },
);
assert.equal(allTrainingCurrent.recentAverage, 92, 'All mode may show a current Training-only metric');
assert.equal(allTrainingCurrent.trend.label, 'Not enough data yet', 'All mode does not compare current Training against previous mixed data');

const allCompetitionComparable = [
  { id: 'comp-prev', date: '2026-04-10', discipline: 'Trap', dataType: 'competition', score: 88, winningScore: 100 },
  { id: 'comp-now', date: '2026-06-20', discipline: 'Trap', dataType: 'competition', score: 92, winningScore: 100 },
];
assert.equal(mod.calculatePerformanceSummary(allCompetitionComparable, mod.filterPerformanceResults(allCompetitionComparable, { period: '90d', type: 'all', discipline: 'Trap', today }), { period: '90d', type: 'all', discipline: 'Trap', today }).trend.label, 'Improving', 'All mode computes trend when both periods are Competition-only');

const allTrainingComparable = [
  { id: 'train-prev', date: '2026-04-10', discipline: 'Trap', dataType: 'training', score: 40, maxScore: 50 },
  { id: 'train-now', date: '2026-06-20', discipline: 'Trap', dataType: 'training', score: 45, maxScore: 50 },
];
assert.equal(mod.calculatePerformanceSummary(allTrainingComparable, mod.filterPerformanceResults(allTrainingComparable, { period: '90d', type: 'all', discipline: 'Trap', today }), { period: '90d', type: 'all', discipline: 'Trap', today }).trend.label, 'Improving', 'All mode computes trend when both periods are Training-only');

const mixedCurrentAllType = [
  { id: 'comp-prev', date: '2026-04-10', discipline: 'Leirduesti', dataType: 'competition', score: 90, winningScore: 100 },
  { id: 'train-prev', date: '2026-04-11', discipline: 'Leirduesti', dataType: 'training', score: 10, maxScore: 100 },
  { id: 'comp-now', date: '2026-06-20', discipline: 'Leirduesti', dataType: 'competition', score: 91, winningScore: 100 },
  { id: 'train-now', date: '2026-06-21', discipline: 'Leirduesti', dataType: 'training', score: 50, maxScore: 50 },
];
const allTypeTrend = mod.calculatePerformanceSummary(
  mixedCurrentAllType,
  mod.filterPerformanceResults(mixedCurrentAllType, { period: '90d', type: 'all', discipline: 'Leirduesti', today }),
  { period: '90d', type: 'all', discipline: 'Leirduesti', today },
);
assert.equal(allTypeTrend.recentAverage, null, 'All type does not average competition winner-relative percentages with training hit percentages');
assert.equal(allTypeTrend.trend.label, 'Not enough data yet', 'All type mixed metrics do not report a combined trend');

const breakdownRows = [
  { id: 'oldest', date: '2026-01-01', discipline: 'Trap', dataType: 'competition', score: 50, winningScore: 100 },
  { id: 'new3a', date: '2026-05-01', discipline: 'Trap', dataType: 'competition', score: 80, winningScore: 100 },
  { id: 'new3b', date: '2026-06-01', discipline: 'Trap', dataType: 'competition', score: 90, winningScore: 100 },
  { id: 'new3c', date: '2026-07-01', discipline: 'Trap', dataType: 'competition', score: 100, winningScore: 100 },
  { id: 'trap-training', date: '2026-07-02', discipline: 'Trap', dataType: 'training', score: 45, maxScore: 50 },
  { id: 'skeet-comp', date: '2026-07-03', discipline: 'Skeet', dataType: 'competition', score: 70, winningScore: 100 },
];
const trapCompetitionBreakdown = mod.calculateDisciplineBreakdown(mod.filterPerformanceResults(breakdownRows, { period: 'all', type: 'competition', discipline: 'Trap', today }));
assert.equal(trapCompetitionBreakdown.length, 1, 'discipline breakdown respects selected discipline');
assert.equal(trapCompetitionBreakdown[0].trainingCount, 0, 'Competition breakdown excludes Training stats');
assert.equal(trapCompetitionBreakdown[0].competitionRecent, 90, 'discipline recent Competition uses newest three results, not database order');
const trapTrainingBreakdown = mod.calculateDisciplineBreakdown(mod.filterPerformanceResults(breakdownRows, { period: 'all', type: 'training', discipline: 'Trap', today }));
assert.equal(trapTrainingBreakdown[0].competitionCount, 0, 'Training breakdown excludes Competition stats');
assert.equal(trapTrainingBreakdown[0].trainingHitAverage, 90, 'Training breakdown reports hit percentage only');
const periodBreakdown = mod.calculateDisciplineBreakdown(mod.filterPerformanceResults(breakdownRows, { period: '30d', type: 'competition', today }));
assert.deepEqual(periodBreakdown.map((item) => item.discipline), ['Skeet', 'Trap'], 'discipline breakdown respects selected period');

assert.deepEqual([0, 3, 5, 10, 20].map(mod.calculateDataConfidence), ['Very low', 'Low', 'Moderate', 'Good', 'Strong'], 'data confidence labels use sample size');
const winner = mod.calculateWinnerContext(rows);
assert.equal(winner.count, 4, 'winner-gap calculations use competition results with winning scores');
assert.equal(winner.bestGap, 8, 'best gap is smallest target gap');
assert.equal(winner.latestGap, 8, 'latest gap uses newest valid result');

rmSync('.performance-test-build', { recursive: true, force: true });
rmSync('.performance-test-tsconfig.json', { force: true });
console.log('performance summary tests passed');
