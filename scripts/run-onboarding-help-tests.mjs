import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const component = readFileSync('app/components/OnboardingHelp.tsx', 'utf8');
for (const text of [
  'Save something useful today',
  'Add your first competition',
  'Scorecard photos:',
  'Training Score Sheet',
  'Review Performance',
  'How this works',
  'Get started',
  'Dismiss tips',
  'Remind me later',
]) assert.match(component, new RegExp(text.replace(/[/.]/g, '\\$&')), `onboarding contains ${text}`);
assert.match(component, /ONBOARDING_DISMISSED_KEY/, 'dismissal key is centralized');
assert.match(component, /window\.localStorage\.setItem\(key, value\)/, 'dismissal persists to localStorage');
assert.match(component, /action !== \"remind_me_later\"[\s\S]*safeSet\(ONBOARDING_DISMISSED_KEY, \"true\"\)/, 'remind me later does not persist dismissal');
assert.match(component, /dismiss\(\"get_started\"\)[\s\S]*Get started/, 'get started action is wired');
assert.match(component, /dismiss\(\"dismiss\"\)[\s\S]*Dismiss tips/, 'dismiss tips action is wired');
assert.match(component, /dismiss\(\"remind_me_later\"\)[\s\S]*Remind me later/, 'remind me later action is wired');
assert.doesNotMatch(component, /Open help later|open_help_later/, 'old open help later copy and action are removed');
assert.match(component, /window\.localStorage\.getItem\(key\)/, 'dismissal reads from localStorage');
assert.match(component, /supabase\.auth\.getUser\(\)/, 'global onboarding checks signed-in state before showing');
assert.match(component, /recordHelpEvent\("onboarding_opened", "getting_started"\)/, 'reopen records onboarding_opened');
assert.match(component, /recordHelpEvent\("onboarding_dismissed", "getting_started", action\)/, 'dismiss records onboarding_dismissed with action metadata');
assert.match(component, /recordHelpEvent\("contextual_help_dismissed", storageKey\)/, 'contextual dismiss records event');
assert.match(component, /metadata: \{ feature, action \}/, 'onboarding analytics sends privacy-safe feature and action metadata');

const nav = readFileSync('app/components/AuthHeader.tsx', 'utf8');
assert.match(nav, /Help \/ Getting started/, 'menu contains Help / Getting started');
assert.match(nav, /openOnboardingHelp\(\)/, 'menu reopens onboarding panel');
assert.match(component, /const reopen = \(\) => \{[\s\S]*setOpen\(true\)/, 'global Help / Getting started can reopen after persisted dismissal');

const layout = readFileSync('app/layout.tsx', 'utf8');
assert.match(layout, /<AuthHeader \/>[\s\S]*<OnboardingHelpPanel \/>[\s\S]*<ProfileGate>/, 'onboarding panel is mounted globally anywhere AuthHeader is present');

const dashboard = readFileSync('app/dashboard/page.tsx', 'utf8');
assert.doesNotMatch(dashboard, /<OnboardingHelpPanel \/>|from "@\/app\/components\/OnboardingHelp"/, 'dashboard does not keep a duplicate dashboard-only onboarding mount');

const contexts = [
  ['app/import/leirdue/page.tsx', 'leirdue-import', 'Check your shooter row and result before importing. This adds a result, not target-by-target misses or scorecard photos.'],
  ['app/sessions/[id]/scorecard-import/page.tsx', 'scorecard-photo-import', 'Upload a scorecard photo, crop if needed, review the detected post structure and target results, then apply.'],
  ['app/training-score-sheets/page.tsx', 'training-score-sheet', 'Use this when one person records scores for several shooters during training.'],
  ['app/results/new/page.tsx', 'manual-result', 'Save a score now, then add post, target or scorecard detail later if useful.'],
];
for (const [file, key, copy] of contexts) {
  const source = readFileSync(file, 'utf8');
  assert.match(source, /ContextualHelpCard/, `${file} uses contextual help card`);
  assert.match(source, new RegExp(`storageKey=\\"${key}\\"`), `${file} has stable dismissal key`);
  assert.match(source, new RegExp(copy.replace(/[/.]/g, '\\$&')), `${file} has practical help copy`);
}

const css = readFileSync('app/globals.css', 'utf8');
assert.match(css, /onboardingHelpPanel[\s\S]*contextualHelpCard/, 'help cards have shared styles');
assert.match(css, /@media \(max-width: 520px\)[\s\S]*contextualHelpCard/, 'help cards include mobile layout');
assert.match(css, /var\(--card-bg\)|var\(--text\)|var\(--lineStrong\)/, 'help styles use theme tokens for light/dark');

const analytics = readFileSync('lib/analytics.ts', 'utf8');
for (const eventName of ['onboarding_opened','onboarding_dismissed','contextual_help_dismissed']) assert.match(analytics, new RegExp(`"${eventName}"`), `${eventName} is in analytics allowlist`);

console.log('onboarding help focused tests passed');

// Exercise the actual help component handlers with a small hook/storage harness.
// This is a component-state test, not a browser or viewport test.
const { default: ts } = await import('typescript');
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const storage = new Map();
let blockStorage = false;
let states = [];
let effects = [];
let cursor = 0;
let effectCursor = 0;
let pendingEffects = [];
const dependencies = {
  'react': {
    useId: () => 'test-help',
    useState: initial => {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useEffect: (callback, deps) => {
      const index = effectCursor++;
      if (!effects[index] || deps.some((value, i) => value !== effects[index][i])) pendingEffects.push(callback);
      effects[index] = deps;
    },
  },
  'react/jsx-runtime': require('react/jsx-runtime'),
  'next/link': () => null,
  '@/lib/analytics': { recordAnalyticsEvent: async () => {} },
  '@/lib/supabase/client': { supabase: {} },
};
const compiled = ts.transpileModule(component, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const compiledModule = { exports: {} };
new Function('require', 'module', 'exports', 'window', compiled)(name => {
  assert.ok(Object.hasOwn(dependencies, name), `unexpected dependency ${name}`);
  return dependencies[name];
}, compiledModule, compiledModule.exports, { localStorage: {
  getItem: key => { if (blockStorage) throw Error('unavailable'); return storage.get(key) ?? null; },
  setItem: (key, value) => { if (blockStorage) throw Error('unavailable'); storage.set(key, value); },
} });
const Help = compiledModule.exports.ContextualHelpCard;
function render(key = 'scorecard-photo-import') {
  cursor = effectCursor = 0;
  const tree = Help({ storageKey: key, children: 'Keep your scorecard for comparison.' });
  const callbacks = pendingEffects; pendingEffects = [];
  if (callbacks.length) { callbacks.forEach(callback => callback()); return render(key); }
  return tree;
}
function mount(key) { states = []; effects = []; return render(key); }
function elements(tree) {
  if (!tree || typeof tree !== 'object') return [];
  const children = [tree.props?.children].flat(Infinity);
  return [tree, ...children.flatMap(elements)];
}
function click(tree, label) {
  const button = elements(tree).find(node => node.type === 'button' && node.props.children === label);
  assert.ok(button, `button ${label} is available`);
  button.props.onClick();
}
function hasHelp(tree) { return elements(tree).some(node => node.type === 'aside'); }
for (const key of ['scorecard-photo-import', 'training-score-sheet', 'leirdue-import']) {
  let tree = mount(key);
  assert.equal(hasHelp(tree), true, 'new feature shows inline help');
  assert.equal(elements(tree).filter(node => node.type === 'li').length, 3, 'three focused steps');
  click(tree, 'Skip');
  tree = render(key);
  assert.equal(hasHelp(tree), false, 'skip collapses help without removing the reopen control');
  assert.equal(hasHelp(mount(key)), false, 'dismissal survives remount');
  click(render(key), 'How this works');
  assert.equal(hasHelp(render(key)), true, 'reopen works after dismissal');
  click(render(key), 'Got it');
  assert.equal(hasHelp(mount(key)), false, 'completion remains dismissed on later entry');
}
blockStorage = true;
let tree = mount('training-score-sheet');
assert.equal(hasHelp(tree), true, 'storage failure does not crash help');
click(tree, 'Got it');
assert.equal(hasHelp(render('training-score-sheet')), false, 'help can still be dismissed without storage');
console.log('contextual help interaction and persistence tests passed');
