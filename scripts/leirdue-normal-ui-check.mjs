import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computedClassStyle, resolveCssVariables, themeVariables } from './css-cascade-harness.mjs';

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
const widths = [320, 375, 390, 430, 1024];
const surfaceCases = [
  ['candidateCard', 'surface-secondary', 'text-primary'],
  ['manualLinkImportPanel', 'notice-bg', 'text-primary'],
  ['searchProgressPanel', 'surface-secondary', 'text-primary'],
  ['sessionItem', 'surface-secondary', 'text-primary'],
  ['shooterScoreCard', 'field-surface-secondary', 'field-text-primary'],
];

for (const theme of ['dark', 'light']) {
  const variables = themeVariables(css, theme);
  for (const width of widths) {
    for (const [className, backgroundToken, textToken] of surfaceCases) {
      const style = computedClassStyle(css, { className, theme, width });
      assert.equal(style.background, resolveCssVariables(`var(--${backgroundToken})`, variables), `${className} uses the ${theme} background token at ${width}px`);
      assert.equal(style.color, resolveCssVariables(`var(--${textToken})`, variables), `${className} uses the ${theme} text token at ${width}px`);
    }

    const editor = computedClassStyle(css, { className: 'leirdueResultEditor', theme, width });
    assert.equal(editor.background, resolveCssVariables('var(--surface-secondary)', variables), `result editor uses the ${theme} surface at ${width}px`);
    assert.equal(editor['min-width'], '0', `result editor remains shrinkable at ${width}px`);
    assert.equal(editor.overflow, 'hidden', `result editor contains overflow at ${width}px`);

    const selected = computedClassStyle(css, { className: 'selectedResultCard', theme, width });
    assert.equal(selected.background, resolveCssVariables('var(--notice-bg)', variables), `selected result uses the ${theme} notice surface at ${width}px`);
    assert.equal(selected['border-color'], resolveCssVariables('var(--action-selected-border)', variables), `selected result uses the ${theme} selected border at ${width}px`);

    const candidateLayout = computedClassStyle(css, { className: 'compactCandidateRow', theme, width });
    const scoreLayout = computedClassStyle(css, { className: 'leirdueScoreGrid', theme, width });
    if (width <= 430) {
      assert.equal(candidateLayout['grid-template-columns'], '1fr', `candidate review is one column at ${width}px`);
      assert.equal(scoreLayout['grid-template-columns'], 'repeat(2, minmax(0, 1fr))', `score editor is bounded at ${width}px`);
    } else {
      assert.equal(candidateLayout['grid-template-columns'], 'minmax(0, 1fr) auto auto', 'desktop candidate review keeps compact actions');
      assert.equal(scoreLayout['grid-template-columns'], 'repeat(3, minmax(0, 1fr))', 'desktop score editor keeps three columns');
    }
  }
}

const darkCandidate = computedClassStyle(css, { className: 'candidateCard', theme: 'dark', width: 390 });
const lightCandidate = computedClassStyle(css, { className: 'candidateCard', theme: 'light', width: 390 });
assert.notEqual(darkCandidate.background, lightCandidate.background, 'computed Light and Dark candidate surfaces are visibly distinct');
assert.notEqual(darkCandidate.color, lightCandidate.color, 'computed Light and Dark candidate text is visibly distinct');

console.log(`Leirdue normal UI regression check passed (${widths.length} widths in Light and Dark).`);
