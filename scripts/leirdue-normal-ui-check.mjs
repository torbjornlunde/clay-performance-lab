import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync('app/import/leirdue/page.tsx', 'utf8');
const css = readFileSync('app/globals.css', 'utf8');

const forbiddenNormalUi = [
  'Coverage diagnostics',
  'Debug details',
  'Cache diagnostics:',
  'Candidate count diagnostics:',
  'Candidate pipeline diagnostics:',
  'Parser notes:',
  'Validation checklist:',
  'Event IDs inspected:',
  'stevne_id:',
  'liste_id:',
];

for (const label of forbiddenNormalUi) {
  assert.doesNotMatch(page, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${label} must not be rendered in the normal import UI`);
}

for (const requiredUserDetail of [
  'Winning score:',
  'Shooting ground / organizer',
  'Series / course scores',
  'Possible duplicate',
  'Open Leirdue link',
  'Import selected result',
]) {
  assert.match(page, new RegExp(requiredUserDetail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${requiredUserDetail} remains available to shooters`);
}

assert.doesNotMatch(page, /<DebugDetails|<CoverageDiagnostics/, 'diagnostic components are not mounted in the normal route');
assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.compactCandidateRow\s*\{[\s\S]*?grid-template-columns:\s*1fr/, 'result review collapses to one column at all requested mobile widths');
assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.leirdueScoreGrid\s*\{\s*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/, 'result editor uses a bounded mobile grid');
assert.match(css, /\.compactCandidateRow\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto auto/, 'desktop review retains its compact action layout');
console.log('Leirdue normal UI regression check passed.');
