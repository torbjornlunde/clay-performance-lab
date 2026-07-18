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

const improving = mod.calculatePerformanceSummary(rows, mod.filterPerformanceResults(rows, { period: '30d', type: 'competition', today }), { period: '30d', today });
assert.equal(improving.trend.label, 'Improving', 'current vs previous period trend detects improvement');
assert.equal(mod.calculateTrend(90, 89).label, 'Stable', 'stable threshold uses ±1.5 percentage points');
assert.equal(mod.calculateTrend(90, null).label, 'Not enough data yet', 'insufficient data is cautious');
assert.deepEqual([0, 3, 5, 10, 20].map(mod.calculateDataConfidence), ['Very low', 'Low', 'Moderate', 'Good', 'Strong'], 'data confidence labels use sample size');
const winner = mod.calculateWinnerContext(rows);
assert.equal(winner.count, 4, 'winner-gap calculations use competition results with winning scores');
assert.equal(winner.bestGap, 8, 'best gap is smallest target gap');
assert.equal(winner.latestGap, 8, 'latest gap uses newest valid result');

rmSync('.performance-test-build', { recursive: true, force: true });
rmSync('.performance-test-tsconfig.json', { force: true });
console.log('performance summary tests passed');
