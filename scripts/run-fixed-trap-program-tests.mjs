import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

execSync('rm -rf .fixed-trap-test-build && npx tsc lib/disciplines.ts lib/trap/fixedTrapProgram.ts --ignoreConfig --module NodeNext --moduleResolution NodeNext --target ES2022 --lib ES2022,DOM --outDir .fixed-trap-test-build --skipLibCheck', {stdio:'inherit'});
const trap = await import('../.fixed-trap-test-build/trap/fixedTrapProgram.js');
const disciplines = await import('../.fixed-trap-test-build/disciplines.js');

const cyclicFiveStand = {
  id: 'synthetic-five-stand',
  label: 'Synthetic five stand',
  discipline: disciplines.TRAP,
  standCount: 5,
  targetsPerSeries: 25,
  rotation: { type: 'cyclic', targetsPerStand: 5 },
};

assert.deepEqual(
  Array.from({ length: 6 }, (_, index) => trap.resolveTrapStand(cyclicFiveStand, 1, index + 1)),
  [1, 1, 1, 1, 1, 2],
  'start stand 1 stays on the first stand for five targets before rotating',
);
assert.deepEqual(
  Array.from({ length: 11 }, (_, index) => trap.resolveTrapStand(cyclicFiveStand, 4, index + 1)),
  [4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 1],
  'start stand 4 rotates by five-target blocks and wraps to stand 1',
);
assert.equal(trap.resolveTrapStand(cyclicFiveStand, 5, 5), 5, 'stand 5 remains active through the fifth target in its block');
assert.equal(trap.resolveTrapStand(cyclicFiveStand, 5, 6), 1, 'stand 5 wraps to stand 1 after a five-target block');

const sequence = trap.buildTrapStandSequence(cyclicFiveStand, 1);
assert.deepEqual(
  sequence,
  [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5],
  'start stand 1 builds the full five-target-block sequence',
);
assert.equal(sequence.length, 25, 'a full series contains the configured target count');
assert.deepEqual(
  [1, 2, 3, 4, 5].map((stand) => sequence.filter((value) => value === stand).length),
  [5, 5, 5, 5, 5],
  '25 targets assign five shots to each stand in a five-stand cyclic program',
);

const syntheticThreeStand = {
  id: 'synthetic-three-stand',
  label: 'Synthetic three stand',
  discipline: disciplines.TRAP,
  standCount: 3,
  targetsPerSeries: 8,
  rotation: { type: 'cyclic', targetsPerStand: 2 },
};
assert.deepEqual(
  trap.buildTrapStandSequence(syntheticThreeStand, 2),
  [2, 2, 3, 3, 1, 1, 2, 2],
  'the engine supports non-five-stand programs with configurable targets per stand',
);

assert.throws(() => trap.resolveTrapStand(cyclicFiveStand, 0, 1), /Start stand/, 'start stand 0 is invalid');
assert.throws(() => trap.resolveTrapStand(cyclicFiveStand, 6, 1), /Start stand/, 'start stand greater than stand count is invalid');
assert.throws(() => trap.resolveTrapStand(cyclicFiveStand, 1, 0), /Shot number/, 'shot number 0 is invalid');
assert.throws(() => trap.validateTrapProgram({ ...cyclicFiveStand, standCount: 0 }), /standCount/, 'invalid program definitions are rejected');
assert.throws(() => trap.validateTrapProgram({ ...cyclicFiveStand, rotation: { type: 'cyclic', targetsPerStand: 0 } }), /targetsPerStand/, 'targetsPerStand 0 is rejected');
assert.throws(() => trap.validateTrapProgram({ ...cyclicFiveStand, rotation: { type: 'cyclic', targetsPerStand: 1.5 } }), /targetsPerStand/, 'non-integer targetsPerStand is rejected');

assert.equal(trap.JEGERTRAP_PROGRAM.discipline, disciplines.JEGERTRAP_NORDISK_TRAP, 'Jegertrap uses the shared canonical discipline label');
assert.equal(trap.NORDISK_TRAP_PROGRAM.discipline, disciplines.JEGERTRAP_NORDISK_TRAP, 'Nordisk trap uses the shared canonical discipline label');
assert.equal(trap.JEGERTRAP_PROGRAM.rotation.targetsPerStand, 5, 'Jegertrap preset uses five targets per stand');
assert.equal(trap.NORDISK_TRAP_PROGRAM.rotation.targetsPerStand, 5, 'Nordisk trap preset uses five targets per stand');
assert.deepEqual(trap.buildTrapStandSequence(trap.JEGERTRAP_PROGRAM, 4).slice(0, 11), [4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 1], 'Jegertrap preset resolves block-based rotation through the generic engine');
assert.deepEqual(trap.buildTrapStandSequence(trap.NORDISK_TRAP_PROGRAM, 1).slice(0, 6), [1, 1, 1, 1, 1, 2], 'Nordisk trap preset resolves block-based rotation through the generic engine');

const presetSeries = trap.buildTrapSeriesStandSequences(trap.JEGERTRAP_PROGRAM, [4, 1, 3]);
assert.equal(presetSeries.length, 3, 'one sequence is returned per supplied start stand');
assert.deepEqual(presetSeries.map((series) => series.length), [25, 25, 25], 'each Jegertrap series keeps 25 assignments');
assert.deepEqual(presetSeries.map((series) => series[0]), [4, 1, 3], 'each returned series starts at its own requested start stand');
assert.deepEqual(presetSeries[0].slice(0, 11), [4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 1], 'multi-series helper preserves start stand 4 block rotation');
assert.deepEqual(presetSeries[1].slice(0, 6), [1, 1, 1, 1, 1, 2], 'multi-series helper resolves the second series independently');
assert.deepEqual(presetSeries[2].slice(0, 6), [3, 3, 3, 3, 3, 4], 'multi-series helper resolves the third series independently');
assert.throws(() => trap.buildTrapSeriesStandSequences(trap.JEGERTRAP_PROGRAM, [4, 6, 1]), /Start stand/, 'an invalid start stand in any series is rejected');
assert.deepEqual(trap.buildTrapSeriesStandSequences(trap.JEGERTRAP_PROGRAM, []), [], 'empty startStands returns no series');
assert.deepEqual(
  trap.buildTrapSeriesStandSequences(syntheticThreeStand, [2, 1]),
  [
    [2, 2, 3, 3, 1, 1, 2, 2],
    [1, 1, 2, 2, 3, 3, 1, 1],
  ],
  'non-five-stand programs work across multiple series',
);

execSync('rm -rf .fixed-trap-test-build');
console.log('fixed trap program engine tests passed');
