import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

execSync(
  'rm -rf .discipline-test-build && npx tsc lib/disciplines.ts --ignoreConfig --module NodeNext --moduleResolution NodeNext --target ES2022 --lib ES2022,DOM --outDir .discipline-test-build --skipLibCheck',
  { stdio: 'inherit' },
);

const d = await import('../.discipline-test-build/disciplines.js');

assert.equal(d.isPostBasedSportingDiscipline(d.ENGLISH_SPORTING), true);
assert.equal(d.isPostBasedSportingDiscipline('engelsk sporting'), true);
assert.equal(d.isPostBasedSportingDiscipline(' English Sporting '), true);
assert.equal(d.isEnglishSporting(d.ENGLISH_SPORTING), true);
assert.equal(d.postTargetUnitLabel(d.ENGLISH_SPORTING), 'Stand');
assert.equal(d.postTargetUnitLabel(d.LEIRDUESTI), 'Post');
assert.equal(d.isPostBasedSportingDiscipline(d.COMPAK_SPORTING), false);
assert.equal(d.isPostBasedSportingDiscipline(d.SPORTTRAP), false);

console.log('discipline behavior tests passed');
