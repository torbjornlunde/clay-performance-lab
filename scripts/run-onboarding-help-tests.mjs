import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const component = readFileSync('app/components/OnboardingHelp.tsx', 'utf8');
for (const text of [
  'Import competition results from Leirdue.net.',
  'Add a result manually',
  'Use scorecard/photo import',
  'Use Training Score Sheet',
  'Review misses and analysis later',
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
  ['app/import/leirdue/page.tsx', 'leirdue-import', 'Search your Leirdue.net results, review matches, then import only the results you want.'],
  ['app/sessions/[id]/scorecard-import/page.tsx', 'scorecard-photo-import', 'Upload a scorecard photo, crop if needed, review the detected scores, then apply.'],
  ['app/training-score-sheets/page.tsx', 'training-score-sheet', 'Use this when one person records scores for several shooters during training.'],
  ['app/results/new/page.tsx', 'manual-result', 'Use this when you only want to save a result quickly without detailed target logging.'],
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
