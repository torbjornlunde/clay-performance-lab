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
  rotation: { type: 'cyclic' },
};

assert.deepEqual(
  Array.from({ length: 6 }, (_, index) => trap.resolveTrapStand(cyclicFiveStand, 1, index + 1)),
  [1, 2, 3, 4, 5, 1],
  'start stand 1 follows a full cyclic sequence and wraps to 1',
);
assert.deepEqual(
  Array.from({ length: 11 }, (_, index) => trap.resolveTrapStand(cyclicFiveStand, 4, index + 1)),
  [4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4],
  'start stand 4 resolves across multiple cycles',
);

const sequence = trap.buildTrapStandSequence(cyclicFiveStand, 1);
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
  rotation: { type: 'cyclic' },
};
assert.deepEqual(
  trap.buildTrapStandSequence(syntheticThreeStand, 2),
  [2, 3, 1, 2, 3, 1, 2, 3],
  'the engine supports non-five-stand programs',
);

assert.throws(() => trap.resolveTrapStand(cyclicFiveStand, 0, 1), /Start stand/, 'start stand 0 is invalid');
assert.throws(() => trap.resolveTrapStand(cyclicFiveStand, 6, 1), /Start stand/, 'start stand greater than stand count is invalid');
assert.throws(() => trap.resolveTrapStand(cyclicFiveStand, 1, 0), /Shot number/, 'shot number 0 is invalid');
assert.throws(() => trap.validateTrapProgram({ ...cyclicFiveStand, standCount: 0 }), /standCount/, 'invalid program definitions are rejected');

assert.equal(trap.JEGERTRAP_PROGRAM.discipline, disciplines.JEGERTRAP_NORDISK_TRAP, 'Jegertrap uses the shared canonical discipline label');
assert.equal(trap.NORDISK_TRAP_PROGRAM.discipline, disciplines.JEGERTRAP_NORDISK_TRAP, 'Nordisk trap uses the shared canonical discipline label');
assert.deepEqual(trap.buildTrapStandSequence(trap.JEGERTRAP_PROGRAM, 4).slice(0, 6), [4, 5, 1, 2, 3, 4], 'Jegertrap preset resolves through the generic engine');
assert.deepEqual(trap.buildTrapStandSequence(trap.NORDISK_TRAP_PROGRAM, 1).slice(0, 6), [1, 2, 3, 4, 5, 1], 'Nordisk trap preset resolves through the generic engine');

execSync('rm -rf .fixed-trap-test-build');
console.log('fixed trap program engine tests passed');
