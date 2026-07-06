import fs from 'node:fs';

const css = fs.readFileSync('app/globals.css', 'utf8');

function varsFrom(blockText) {
  return Object.fromEntries(
    [...blockText.matchAll(/--([a-zA-Z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  );
}

const rootVars = [...css.matchAll(/:root\s*\{([\s\S]*?)\n\}/gm)].reduce(
  (acc, m) => ({ ...acc, ...varsFrom(m[1]) }),
  {},
);
const lightVars = {
  ...rootVars,
  ...[...css.matchAll(/html\[data-theme="light"\]\s*\{([\s\S]*?)\n\}/gm)].reduce(
    (acc, m) => ({ ...acc, ...varsFrom(m[1]) }),
    {},
  ),
};

function hexToRgb(hex) {
  const clean = hex.replace('#', '').trim();
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16));
}
function luminance([r, g, b]) {
  return [r, g, b]
    .map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a, b) {
  const [l1, l2] = [luminance(hexToRgb(a)), luminance(hexToRgb(b))].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
function resolve(value, vars) {
  let current = value ?? '';
  for (let i = 0; i < 10; i += 1) {
    current = current.replace(/var\(--([^)]+)\)/g, (_, name) => vars[name] ?? `var(--${name})`);
  }
  return current;
}
function hexStops(value) {
  return [...new Set(resolve(value, currentVars).match(/#[0-9a-fA-F]{6}/g) ?? [])];
}

let currentVars = rootVars;
const failures = [];

function checkPair(theme, vars, label, bgVar, textVar, min = 4.5) {
  currentVars = vars;
  const stops = hexStops(vars[bgVar]);
  const texts = hexStops(vars[textVar]);
  if (!stops.length || !texts.length) {
    failures.push(`${theme} ${label}: missing opaque hex stop(s) for ${bgVar}/${textVar}`);
    return;
  }
  for (const stop of stops) {
    for (const text of texts) {
      const ratio = contrast(stop, text);
      if (ratio < min) failures.push(`${theme} ${label}: contrast ${ratio.toFixed(2)} below ${min} (${text} on ${stop})`);
    }
  }
}

const themePairs = [
  ['primary action', 'action-primary-bg', 'action-primary-text', 4.5],
  ['primary action first stop', 'action-primary-bg-start', 'action-primary-text', 4.5],
  ['primary action last stop', 'action-primary-bg-end', 'action-primary-text', 4.5],
  ['secondary action', 'action-secondary-bg-solid', 'action-secondary-text', 4.5],
  ['selected action first stop', 'action-selected-bg-start', 'action-selected-text', 4.5],
  ['selected action last stop', 'action-selected-bg-end', 'action-selected-text', 4.5],
  ['unselected action', 'action-unselected-bg-solid', 'action-unselected-text', 4.5],
  ['disabled action', 'action-disabled-bg-solid', 'action-disabled-text-solid', 3],
  ['surface cell', 'surface-cell-solid', 'text-primary', 4.5],
  ['surface cell muted text', 'surface-cell-solid', 'text-secondary', 4.5],
  ['notice', 'notice-bg-solid', 'notice-text', 4.5],
  ['error', 'error-bg-solid', 'error-text', 4.5],
  ['success', 'success-bg-solid', 'success-text', 4.5],
  ['field panel', 'field-surface-inset-solid', 'field-text-primary', 4.5],
  ['field muted text', 'field-surface-inset-solid', 'field-text-secondary', 4.5],
];

// Solid notice tokens are test-only representatives for translucent semantic notice backgrounds.
rootVars['notice-bg-solid'] = '#1a1710';
rootVars['error-bg-solid'] = '#211210';
rootVars['success-bg-solid'] = '#102018';
lightVars['notice-bg-solid'] = '#e8d8b8';
lightVars['error-bg-solid'] = '#ead0ca';
lightVars['success-bg-solid'] = '#cfdfd1';

for (const pair of themePairs) checkPair('Dark', rootVars, ...pair);
for (const pair of themePairs) checkPair('Light', lightVars, ...pair);

function ruleFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...css.matchAll(new RegExp(`([^{}]*${escaped}[^{}]*)\\{([^{}]+)\\}`, 'g'))];
  return matches.map((m) => m[2]).join('\n');
}
function expectRule(selector, expectations) {
  const body = ruleFor(selector);
  if (!body) {
    failures.push(`${selector}: missing CSS rule`);
    return;
  }
  for (const [property, token] of expectations) {
    const pattern = new RegExp(`${property}\\s*:[^;]*var\\(${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`);
    if (!pattern.test(body)) failures.push(`${selector}: expected ${property} to use ${token}`);
  }
}

const componentExpectations = [
  ['.secondary', [['background', '--action-secondary-bg'], ['color', '--action-secondary-text'], ['border-color', '--action-secondary-border']]],
  ['.standNumberButton.secondary', [['background', '--action-unselected-bg'], ['color', '--action-unselected-text'], ['border-color', '--action-unselected-border']]],
  ['.standPresentationCard', [['background', '--surface-secondary'], ['color', '--text-primary']]],
  ['.standPresentationType', [['background', '--surface-cell'], ['color', '--text-secondary']]],
  ['.standMachineLabel', [['background', '--surface-cell'], ['color', '--text-primary']]],
  ['.fitascFullscreenPanelStand .standPresentationCard', [['background', '--surface-secondary'], ['color', '--text-primary'], ['border', '--border-subtle']]],
  ['.fitascFullscreenPanelStand .standPresentationType', [['background', '--surface-cell'], ['color', '--text-primary'], ['border-color', '--border-subtle']]],
  ['.schemeOverviewFullscreen .schemeMachineCell', [['background', '--gold2']]],
  ['.card', [['background', '--surface-primary'], ['border-color', '--border-subtle']]],
  ['.pill', [['background', '--pill-bg'], ['color', '--pill-text'], ['border-color', '--pill-border']]],
  ['.resultsSummaryTable', [['background', '--surface-inset']]],
  ['.notice', [['background', '--notice-bg'], ['color', '--notice-text']]],
  ['.error', [['background', '--error-bg'], ['color', '--error-text']]],
  ['.success', [['background', '--success-bg'], ['color', '--success-text']]],
  ['button:disabled', [['background', '--action-disabled-bg'], ['color', '--action-disabled-text'], ['border-color', '--action-disabled-border']]],
];

for (const [selector, expectations] of componentExpectations) expectRule(selector, expectations);

for (const token of ['--action-unselected-bg', '--action-unselected-text', '--action-unselected-border']) {
  if ((css.match(new RegExp(`var\\(${token}\\)`, 'g')) ?? []).length < 1) {
    failures.push(`${token}: token is defined but not used by a component state`);
  }
}

if (failures.length) {
  console.error('Theme regression check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Theme regression check passed (${themePairs.length * 2} Light/Dark contrast checks plus ${componentExpectations.length} semantic selector checks).`);
