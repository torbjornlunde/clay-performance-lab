import fs from 'node:fs';

const css = fs.readFileSync('app/globals.css', 'utf8');

function block(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'));
  if (!match) throw new Error(`Missing CSS block: ${selector}`);
  return match[1];
}

function varsFrom(blockText) {
  return Object.fromEntries([...blockText.matchAll(/--([a-zA-Z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const rootVars = [...css.matchAll(/:root\s*\{([\s\S]*?)\n\}/gm)].reduce((acc, m) => ({ ...acc, ...varsFrom(m[1]) }), {});
const lightVars = { ...rootVars, ...[...css.matchAll(/html\[data-theme=\"light\"\]\s*\{([\s\S]*?)\n\}/gm)].reduce((acc, m) => ({ ...acc, ...varsFrom(m[1]) }), {}) };

function hexToRgb(hex) {
  const clean = hex.replace('#', '').trim();
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16));
}
function luminance([r, g, b]) {
  return [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a, b) {
  const [l1, l2] = [luminance(hexToRgb(a)), luminance(hexToRgb(b))].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
function resolve(value, vars) {
  let current = value;
  for (let i = 0; i < 8; i += 1) current = current.replace(/var\(--([^)]+)\)/g, (_, name) => vars[name] ?? `var(--${name})`);
  return current;
}
function representativeHex(value) {
  const match = value.match(/#[0-9a-fA-F]{6}/g);
  return match?.[match.length - 1];
}

const pairs = [
  ['light primary action', 'action-primary-bg', 'action-primary-text', 4.5],
  ['light secondary action', 'action-secondary-bg', 'action-secondary-text', 4.5],
  ['light selected action', 'action-selected-bg', 'action-selected-text', 4.5],
  ['light unselected action', 'action-unselected-bg', 'action-unselected-text', 4.5],
  ['light disabled action', 'action-disabled-bg-solid', 'action-disabled-text-solid', 3],
  ['light surface cell', 'surface-cell-solid', 'text-primary', 4.5],
  ['dark field panel', 'field-surface-inset-solid', 'field-text-primary', 4.5],
];

const failures = [];
for (const [name, bgVar, textVar, min] of pairs) {
  const bg = representativeHex(resolve(lightVars[bgVar] ?? rootVars[bgVar] ?? '', lightVars));
  const fg = representativeHex(resolve(lightVars[textVar] ?? rootVars[textVar] ?? '', lightVars));
  if (!bg || !fg) failures.push(`${name}: missing representative solid variables (${bgVar}, ${textVar})`);
  else if (contrast(bg, fg) < min) failures.push(`${name}: contrast ${contrast(bg, fg).toFixed(2)} below ${min} (${fg} on ${bg})`);
}

const dangerousRules = [...css.matchAll(/([^{}]*(?:button|Button|\.button|selectorButton|filterButton|periodButton|standNumberButton)[^{}]*)\{([^{}]*background:\s*(?:rgba\((?:7|10|12|13|18|20|26|31),|#(?:0[0-9a-f]|1[0-9a-f]|2[0-9a-f]|3[0-9a-f]))[^{}]*)\}/gi)]
  .filter(([, selector, body]) => !/color\s*:/.test(body) && !/field|fitascFullscreenOverlay|imageLightbox|cropShade|mark|header|topNav/.test(selector));
if (dangerousRules.length) failures.push(`dark background without explicit color in ${dangerousRules.slice(0, 8).map((m) => m[1].trim()).join(', ')}`);

for (const token of ['--action-unselected-bg', '--action-unselected-text', '--action-unselected-border', '--field-surface-inset-solid']) {
  if (!css.includes(token)) failures.push(`Missing semantic token ${token}`);
}

if (failures.length) {
  console.error('Theme regression check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Theme regression check passed (${pairs.length} contrast/state pairs plus static dark-background scan).`);
