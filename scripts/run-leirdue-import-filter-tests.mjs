import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';

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
console.log('Leirdue import filter normalization tests passed');
