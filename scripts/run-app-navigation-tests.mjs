import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync('lib/appNavigation.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
new Function('exports', 'module', js)(module.exports, module);
const { resolveAppBackTarget, updateAppNavigationStack, reconcilePopstateNavigationStack, decideSwipeBackGesture, isSafeInAppPrevious } = module.exports;
const origin = 'https://app.example.test';

let stack = updateAppNavigationStack({ stack: [], next: { path: '/dashboard', origin } });
stack = updateAppNavigationStack({ stack, next: { path: '/sessions/123', origin } });
let resolution = resolveAppBackTarget({ stack, origin, currentPath: '/sessions/123', fallback: '/dashboard' });
assert.equal(resolution.target, '/dashboard', 'uses safe previous in-app route');
assert.equal(resolution.usedFallback, false, 'safe previous route does not use fallback');
assert.equal(resolution.canNavigate, true, 'safe previous route can navigate');
assert.equal(resolution.mode, 'history', 'safe previous route uses real browser history');
assert.equal(resolution.historySteps, 1, 'safe previous route goes back one browser entry');
assert.deepEqual(resolution.nextStack.map((entry) => entry.path), ['/dashboard'], 'custom back consumes the current stack entry');

stack = ['/dashboard', '/sessions/123', '/sessions/123/analysis'].reduce((current, path) => updateAppNavigationStack({ stack: current, next: { path, origin } }), []);
resolution = resolveAppBackTarget({ stack, origin, currentPath: '/sessions/123/analysis', fallback: '/dashboard' });
assert.equal(resolution.target, '/sessions/123', 'analysis custom back targets its parent session');
assert.equal(resolution.mode, 'history', 'analysis custom back consumes real browser history');
assert.equal(resolution.historySteps, 1, 'analysis custom back goes back one browser entry');
stack = updateAppNavigationStack({ stack: resolution.nextStack, next: { path: resolution.target, origin } });
assert.deepEqual(stack.map((entry) => entry.path), ['/dashboard', '/sessions/123'], 'landing on the custom back target does not append a duplicate parent');
resolution = resolveAppBackTarget({ stack, origin, currentPath: '/sessions/123', fallback: '/dashboard' });
assert.equal(resolution.target, '/dashboard', 'second custom back targets dashboard instead of bouncing to analysis');
assert.equal(resolution.mode, 'history', 'second custom back also consumes real browser history');
assert.deepEqual(resolution.nextStack.map((entry) => entry.path), ['/dashboard'], 'second custom back consumes the session entry');

resolution = resolveAppBackTarget({ stack: [{ path: '/sessions/123', origin }], origin, currentPath: '/sessions/123', fallback: '/dashboard' });
assert.equal(resolution.target, '/dashboard', 'direct deep link uses fallback');
assert.equal(resolution.canNavigate, true, 'deep-link fallback can navigate when fallback differs from current route');
assert.equal(resolution.mode, 'replace', 'deep-link fallback replaces instead of pushing a bad history entry');

resolution = resolveAppBackTarget({ stack: [{ path: '/dashboard', origin }], origin, currentPath: '/dashboard', fallback: '/dashboard' });
assert.equal(resolution.canNavigate, false, 'direct dashboard fallback to dashboard is a safe no-op');
assert.equal(resolution.mode, 'none', 'direct dashboard no-op does not touch browser history');
assert.deepEqual(resolution.nextStack.map((entry) => entry.path), ['/dashboard'], 'same-route fallback leaves stack unchanged');

stack = updateAppNavigationStack({ stack: [{ path: '/login', origin }], next: { path: '/dashboard', origin }, replace: true });
assert.equal(stack.length, 1, 'auth startup replace does not retain login entry');
resolution = resolveAppBackTarget({ stack, origin, currentPath: '/dashboard', fallback: '/dashboard' });
assert.equal(resolution.canNavigate, false, 'auth startup fallback avoids login loop and same-route navigation');
assert.equal(resolution.mode, 'none', 'auth startup same-route fallback is a no-op');

stack = ['/dashboard', '/sessions/123', '/sessions/123/analysis'].reduce((current, path) => updateAppNavigationStack({ stack: current, next: { path, origin } }), []);
stack = reconcilePopstateNavigationStack({ stack, next: { path: '/sessions/123', origin } });
assert.deepEqual(stack.map((entry) => entry.path), ['/dashboard', '/sessions/123'], 'native popstate back pops the custom stack to the browser destination');
resolution = resolveAppBackTarget({ stack, origin, currentPath: '/sessions/123', fallback: '/dashboard' });
assert.equal(resolution.target, '/dashboard', 'custom back after native popstate continues backwards');

stack = ['/dashboard', '/sessions/123'].reduce((current, path) => updateAppNavigationStack({ stack: current, next: { path, origin } }), []);
stack = reconcilePopstateNavigationStack({ stack, next: { path: '/settings', origin } });
assert.deepEqual(stack.map((entry) => entry.path), ['/dashboard', '/settings'], 'unknown popstate destination replaces the current stack entry instead of preserving stale forward history');


function applyAppBackToBrowser(paths, currentIndex, appStack, fallback = '/dashboard') {
  const currentPath = paths[currentIndex];
  const result = resolveAppBackTarget({ stack: appStack, origin, currentPath, fallback });
  if (!result.canNavigate) return { paths, currentIndex, appStack: result.nextStack, result };
  if (result.mode === 'history') return { paths, currentIndex: currentIndex - result.historySteps, appStack: result.nextStack, result };
  const nextPaths = paths.slice();
  nextPaths[currentIndex] = result.target;
  return { paths: nextPaths, currentIndex, appStack: updateAppNavigationStack({ stack: result.nextStack, next: { path: result.target, origin }, replace: true }), result };
}

let browserPaths = ['/dashboard', '/sessions/123', '/sessions/123/analysis'];
let browserIndex = 2;
let appStack = browserPaths.reduce((current, path) => updateAppNavigationStack({ stack: current, next: { path, origin } }), []);
let browserState = applyAppBackToBrowser(browserPaths, browserIndex, appStack);
assert.equal(browserState.paths[browserState.currentIndex], '/sessions/123', 'browser lands on session after analysis app Back');
assert.equal(browserState.result.mode, 'history', 'analysis app Back used browser history in browser simulation');
browserState.appStack = reconcilePopstateNavigationStack({ stack: browserState.appStack, next: { path: browserState.paths[browserState.currentIndex], origin } });
browserState = applyAppBackToBrowser(browserState.paths, browserState.currentIndex, browserState.appStack);
assert.equal(browserState.paths[browserState.currentIndex], '/dashboard', 'second app Back lands on dashboard in browser simulation');
assert.equal(browserState.currentIndex, 0, 'app Back returns to original dashboard browser entry, not a new dashboard entry');
assert.equal(browserState.paths[browserState.currentIndex + 1], '/sessions/123', 'native forward entries may exist but native Back will not reopen them');

browserPaths = ['/dashboard', '/sessions/123', '/sessions/123/analysis'];
browserIndex = 2;
appStack = browserPaths.reduce((current, path) => updateAppNavigationStack({ stack: current, next: { path, origin } }), []);
browserState = applyAppBackToBrowser(browserPaths, browserIndex, appStack);
assert.equal(browserState.currentIndex, 1, 'App Back followed by native Back starts from the previous browser entry');
browserState.appStack = reconcilePopstateNavigationStack({ stack: browserState.appStack, next: { path: browserState.paths[browserState.currentIndex], origin } });
browserIndex = browserState.currentIndex - 1;
assert.equal(browserState.paths[browserIndex], '/dashboard', 'native Back after app Back goes to dashboard instead of bouncing forward');

browserPaths = ['/dashboard', '/sessions/123', '/sessions/123/analysis'];
browserIndex = 1;
appStack = browserPaths.reduce((current, path) => updateAppNavigationStack({ stack: current, next: { path, origin } }), []);
appStack = reconcilePopstateNavigationStack({ stack: appStack, next: { path: browserPaths[browserIndex], origin } });
browserState = applyAppBackToBrowser(browserPaths, browserIndex, appStack);
assert.equal(browserState.paths[browserState.currentIndex], '/dashboard', 'native Back followed by app Back remains correct');

browserPaths = ['/sessions/123/analysis'];
browserIndex = 0;
appStack = updateAppNavigationStack({ stack: [], next: { path: '/sessions/123/analysis', origin } });
browserState = applyAppBackToBrowser(browserPaths, browserIndex, appStack, '/dashboard');
assert.equal(browserState.result.mode, 'replace', 'direct deep-link fallback uses replace in browser simulation');
assert.deepEqual(browserState.paths, ['/dashboard'], 'direct deep-link fallback stays inside the app without adding a bad browser entry');
assert.equal(browserState.currentIndex, 0, 'direct deep-link fallback does not create a new history index');

assert.equal(decideSwipeBackGesture({ startX: 29, startY: 10, currentX: 110, currentY: 12, viewportWidth: 390 }), 'cancel', 'swipe must start inside edge threshold');
assert.equal(decideSwipeBackGesture({ startX: 12, startY: 10, currentX: 88, currentY: 18, viewportWidth: 390 }), 'back', 'clear horizontal edge swipe goes back');
assert.equal(decideSwipeBackGesture({ startX: 12, startY: 10, currentX: 35, currentY: 90, viewportWidth: 390 }), 'cancel', 'vertical scroll cancels swipe');
assert.equal(decideSwipeBackGesture({ startX: 12, startY: 10, currentX: 52, currentY: 45, viewportWidth: 390 }), 'pending', 'ambiguous diagonal movement does not navigate');

assert.equal(isSafeInAppPrevious({ path: 'https://evil.example/', origin }, origin, '/sessions/123'), false, 'external custom back path is rejected');
assert.equal(isSafeInAppPrevious({ path: '/login', origin }, origin, '/dashboard'), false, 'login route is rejected as authenticated custom back target');
assert.equal(isSafeInAppPrevious({ path: '/settings', origin: 'https://evil.example' }, origin, '/dashboard'), false, 'external origin is rejected');

const provider = readFileSync('app/components/navigation/AppNavigationProvider.tsx', 'utf8');
assert.match(provider, /navigatingRef\.current/, 'provider guards against double navigation');
assert.match(provider, /writeStack\(resolution\.nextStack\)/, 'provider persists consumed stack before custom navigation');
assert.match(provider, /window\.history\.go\(-resolution\.historySteps\)/, 'provider uses real browser history for known safe in-app previous routes');
assert.match(provider, /router\.replace\(resolution\.target\)/, 'provider replaces for fallback routes instead of pushing');
assert.doesNotMatch(provider, /router\.push\(/, 'provider does not create browser entries for app back');
assert.match(provider, /popstateRef\.current/, 'provider reconciles native popstate with the custom stack');
assert.match(provider, /if \(!resolution\.canNavigate\)/, 'provider leaves same-route fallback as a no-op');
assert.match(provider, /if \(didNavigate\) \{ state\.fired = true; event\.preventDefault\(\); \}/, 'provider prevents default only after real swipe navigation');
assert.match(provider, /shouldIgnoreSwipeTarget\(event\.target\)/, 'provider checks interactive and opt-out targets');
assert.match(source, /data-cpl-swipe-back-opt-out/, 'explicit opt-out marker is documented in target selector');
assert.match(source, /input, textarea, select, button, a/, 'interactive controls are ignored by swipe detection');
assert.match(provider, /history\.replaceState = function patchedReplaceState/, 'provider observes replaceState for auth/startup compatibility');

console.log('App navigation checks passed');
