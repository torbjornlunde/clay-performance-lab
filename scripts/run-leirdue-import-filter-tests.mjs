import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';

execSync('rm -rf .leirdue-filter-test-build && npx tsc lib/disciplines.ts lib/leirdue/normalize.ts --ignoreConfig --module NodeNext --moduleResolution NodeNext --target ES2022 --lib ES2022,DOM --outDir .leirdue-filter-test-build --skipLibCheck', { stdio: 'inherit' });
const disciplines = await import('../.leirdue-filter-test-build/disciplines.js');
const normalize = await import('../.leirdue-filter-test-build/leirdue/normalize.js');

assert.equal(disciplines.JEGERTRAP_NORDISK_TRAP, 'Jegertrap / Nordisk trap', 'shared canonical trap label remains stable');
assert.ok(disciplines.DISCIPLINE_OPTIONS.includes(disciplines.JEGERTRAP_NORDISK_TRAP), 'canonical trap label is part of shared discipline options');
assert.ok(disciplines.DISCIPLINE_OPTIONS.includes(disciplines.TRAP), 'generic Trap remains a shared discipline option');
assert.equal(normalize.normalizeLeirdueDisciplineLabel('Jegertrap 50 skudd').discipline, disciplines.JEGERTRAP_NORDISK_TRAP, 'Jegertrap alias normalizes to canonical label');
assert.equal(normalize.normalizeLeirdueDisciplineLabel('Nordisk trap').discipline, disciplines.JEGERTRAP_NORDISK_TRAP, 'Nordisk trap alias normalizes to canonical label');
assert.equal(normalize.normalizeLeirdueDisciplineLabel('Trap').discipline, disciplines.TRAP, 'generic Trap stays separate');

const page = readFileSync('app/import/leirdue/page.tsx', 'utf8');
assert.match(page, /OPTIONAL_DISCIPLINES = \[JEGERTRAP_NORDISK_TRAP, TRAP, SKEET, "Other"\]/, 'Leirdue checkbox choices include canonical trap before generic Trap');

const parser = readFileSync('lib/leirdue/parser.ts', 'utf8');
assert.match(parser, /d === normalizeText\(JEGERTRAP_NORDISK_TRAP\)[\s\S]*nordisk\\s\+trap\|jegertrap/, 'normal search matches Jegertrap/Nordisk trap only for canonical selection');
assert.match(parser, /d === normalizeText\(TRAP\)[\s\S]*!\/\(nordisk\\s\+trap\|jegertrap\|\\bnt\\b\)/, 'normal search keeps generic Trap separate from Jegertrap/Nordisk trap aliases');
assert.match(parser, /parseLeirdueSharedResultListHtml[\s\S]*JEGERTRAP_NORDISK_TRAP/, 'pasted-link shared parser defaults include canonical trap label');
assert.match(parser, /selectedJegertrap[\s\S]*selectedGenericTrap[\s\S]*nordisk\\s\+trap\|jegertrap/, 'unselected discipline checks distinguish canonical trap from generic Trap');

rmSync('.leirdue-filter-test-build', { recursive: true, force: true });
writeFileSync('.leirdue-save-test-tsconfig.json', JSON.stringify({
  compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2022', lib: ['ES2022', 'DOM'], outDir: '.leirdue-save-test-build', skipLibCheck: true, rootDir: '.', baseUrl: '.', ignoreDeprecations: '6.0', paths: { '@/*': ['./*'] } },
  include: ['lib/leirdue/saveValidation.ts', 'lib/leirdue/types.ts'],
}));
execSync('rm -rf .leirdue-save-test-build && npx tsc -p .leirdue-save-test-tsconfig.json', { stdio: 'inherit' });
const saveValidation = await import('../.leirdue-save-test-build/lib/leirdue/saveValidation.js');
const validCachedCandidate = {
  date: '2026-05-03',
  name: 'Stavanger 100',
  discipline: 'Leirduesti',
  ownScore: 85,
  totalTargets: 100,
  winningScore: null,
  leirdueUrl: 'https://www.leirdue.net/?stevne=12811&liste=59400',
  listType: 'main result list',
  confidence: 'high',
  notes: 'shared cached result-only row',
  category: 'recommended',
  importRecommended: true,
  shooterName: 'Test Shooter',
};
assert.equal(saveValidation.isLeirdueSaveCandidate(validCachedCandidate), true, 'save endpoint accepts shared cached candidate with null winningScore');
assert.equal(saveValidation.leirdueWinningScoreForInsert(validCachedCandidate.winningScore), null, 'insert writes winning_score null when unknown');
assert.equal(saveValidation.isLeirdueSaveCandidate({ ...validCachedCandidate, ownScore: null }), false, 'save endpoint still rejects missing ownScore');
assert.equal(saveValidation.isLeirdueSaveCandidate({ ...validCachedCandidate, totalTargets: null }), false, 'save endpoint still rejects missing totalTargets');
assert.equal(saveValidation.isLeirdueSaveCandidate({ ...validCachedCandidate, ownScore: 101 }), false, 'save endpoint still rejects ownScore > totalTargets');
assert.equal(saveValidation.isLeirdueSaveCandidate({ ...validCachedCandidate, winningScore: 90 }), true, 'live parsed candidate with winningScore still saves unchanged');
assert.equal(saveValidation.leirdueWinningScoreForInsert(90), 90, 'known live parsed winningScore is preserved for insert');
const duplicateSource = readFileSync('lib/leirdue/duplicates.ts', 'utf8');
assert.match(duplicateSource, /exact: sessionHasLeirdueSource\(row\) && sameTotalTargets/, 'duplicate matching works with null winningScore by relying on source and total targets');
assert.match(page, /function hasImportableResultScore[\s\S]*ownScore !== null && candidate\.totalTargets !== null/, 'candidateSelectedByDefault can use ownScore and totalTargets without winningScore');
assert.match(page, /candidateSelectedByDefault[\s\S]*hasImportableResultScore\(candidate\)[\s\S]*duplicateStatus !== "exact"/, 'default selection keeps exact duplicate protection');
assert.match(page, /Winning score: \{candidate\.winningScore \?\? "unknown"\}/, 'UI displays unknown winning score without blocking selection');
rmSync('.leirdue-save-test-build', { recursive: true, force: true });
rmSync('.leirdue-save-test-tsconfig.json', { force: true });
console.log('Leirdue import filter normalization tests passed');
