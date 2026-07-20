import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync('lib/appNavigation.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
new Function('exports', 'module', js)(module.exports, module);
const {
  APP_NAV_STATE_KEY,
  resolveAppBackTarget,
  updateAppNavigationStack,
  reconcilePopstateNavigationStack,
  decideSwipeBackGesture,
  isSafeInAppPrevious,
  readAppHistoryMarker,
  withAppHistoryMarker,
} = module.exports;
const origin = 'https://app.example.test';
const epoch = 'epoch-a';
const otherEpoch = 'epoch-b';
const marked = (path, index, markerEpoch = epoch) => ({ path, origin, historyEpoch: markerEpoch, historyIndex: index });
const marker = (index, markerEpoch = epoch) => ({ v: 1, epoch: markerEpoch, index });

let preserved = withAppHistoryMarker({ __NA: true, tree: ['next'] }, marker(0));
assert.equal(preserved.__NA, true, 'history marker preserves existing Next state fields');
assert.deepEqual(readAppHistoryMarker(preserved), marker(0), 'history marker can be read back from state');
assert.equal(readAppHistoryMarker({ [APP_NAV_STATE_KEY]: { v: 1, epoch, index: -1 } }), null, 'invalid marker is rejected');

let stack = [marked('/dashboard', 0), marked('/sessions/123', 1)];
let resolution = resolveAppBackTarget({ stack, origin, currentPath: '/sessions/123', fallback: '/dashboard', currentMarker: marker(1) });
assert.equal(resolution.target, '/dashboard', 'uses safe previous in-app route');
assert.equal(resolution.mode, 'history', 'verified same-epoch previous route uses real browser history');
assert.equal(resolution.historySteps, 1, 'verified previous route goes back one browser entry');
assert.deepEqual(resolution.nextStack.map((entry) => entry.path), ['/dashboard'], 'custom back consumes the current stack entry');

stack = [marked('/dashboard', 0), marked('/sessions/123', 1, otherEpoch)];
resolution = resolveAppBackTarget({ stack, origin, currentPath: '/sessions/123', fallback: '/dashboard', currentMarker: marker(1) });
assert.equal(resolution.mode, 'replace', 'stale different-epoch stack cannot use browser history');
assert.equal(resolution.target, '/dashboard', 'stale different-epoch stack uses safe fallback target');

stack = [marked('/dashboard', 0), marked('/sessions/123', 2)];
resolution = resolveAppBackTarget({ stack, origin, currentPath: '/sessions/123', fallback: '/dashboard', currentMarker: marker(1) });
assert.equal(resolution.mode, 'replace', 'stack entry not genuinely behind current marker cannot use browser history');

stack = [marked('/dashboard', 0), marked('/sessions/123', 1), marked('/sessions/123/analysis', 2)];
resolution = resolveAppBackTarget({ stack, origin, currentPath: '/sessions/123/analysis', fallback: '/dashboard', currentMarker: marker(2) });
assert.equal(resolution.target, '/sessions/123', 'analysis custom back targets its parent session');
assert.equal(resolution.mode, 'history', 'analysis custom back consumes real browser history');
assert.equal(resolution.historySteps, 1, 'analysis custom back goes back one browser entry');
stack = updateAppNavigationStack({ stack: resolution.nextStack, next: marked('/sessions/123', 1) });
assert.deepEqual(stack.map((entry) => entry.path), ['/dashboard', '/sessions/123'], 'landing on the custom back target does not append a duplicate parent');
resolution = resolveAppBackTarget({ stack, origin, currentPath: '/sessions/123', fallback: '/dashboard', currentMarker: marker(1) });
assert.equal(resolution.target, '/dashboard', 'second custom back targets dashboard instead of bouncing to analysis');
assert.equal(resolution.mode, 'history', 'second custom back also consumes real browser history');
assert.deepEqual(resolution.nextStack.map((entry) => entry.path), ['/dashboard'], 'second custom back consumes the session entry');

resolution = resolveAppBackTarget({ stack: [marked('/sessions/123', 0)], origin, currentPath: '/sessions/123', fallback: '/dashboard', currentMarker: marker(0) });
assert.equal(resolution.target, '/dashboard', 'direct deep link uses fallback');
assert.equal(resolution.mode, 'replace', 'direct deep-link fallback replaces instead of pushing a bad history entry');

resolution = resolveAppBackTarget({ stack: [marked('/dashboard', 0)], origin, currentPath: '/dashboard', fallback: '/dashboard', currentMarker: marker(0) });
assert.equal(resolution.canNavigate, false, 'direct dashboard fallback to dashboard is a safe no-op');
assert.equal(resolution.mode, 'none', 'direct dashboard no-op does not touch browser history');

stack = updateAppNavigationStack({ stack: [marked('/login', 0)], next: marked('/dashboard', 0), replace: true });
assert.equal(stack.length, 1, 'auth startup replace does not retain login entry');
resolution = resolveAppBackTarget({ stack, origin, currentPath: '/dashboard', fallback: '/dashboard', currentMarker: marker(0) });
assert.equal(resolution.canNavigate, false, 'auth startup fallback avoids login loop and same-route navigation');
assert.equal(resolution.mode, 'none', 'auth startup same-route fallback is a no-op');

stack = [marked('/dashboard', 0), marked('/sessions/123', 1), marked('/sessions/123/analysis', 2)];
stack = reconcilePopstateNavigationStack({ stack, next: marked('/sessions/123', 1) });
assert.deepEqual(stack.map((entry) => entry.path), ['/dashboard', '/sessions/123'], 'native popstate back pops the custom stack to the marked browser destination');
stack = reconcilePopstateNavigationStack({ stack, next: marked('/sessions/123/analysis', 2) });
assert.deepEqual(stack.map((entry) => entry.path), ['/dashboard', '/sessions/123', '/sessions/123/analysis'], 'native forward across marked CPL entries restores stack synchronization');
stack = reconcilePopstateNavigationStack({ stack, next: marked('/settings', 0, otherEpoch) });
assert.deepEqual(stack.map((entry) => entry.path), ['/dashboard', '/sessions/123', '/settings'], 'external return with a fresh epoch replaces the current entry and ignores stale forward history');

function applyAppBackToBrowser(paths, currentIndex, appStack, currentMarker, fallback = '/dashboard') {
  const currentPath = paths[currentIndex];
  const result = resolveAppBackTarget({ stack: appStack, origin, currentPath, fallback, currentMarker });
  if (!result.canNavigate) return { paths, currentIndex, appStack: result.nextStack, result, currentMarker };
  if (result.mode === 'history') return { paths, currentIndex: currentIndex - result.historySteps, appStack: result.nextStack, result, currentMarker: marker(currentMarker.index - result.historySteps, currentMarker.epoch) };
  const nextPaths = paths.slice();
  nextPaths[currentIndex] = result.target;
  return { paths: nextPaths, currentIndex, appStack: updateAppNavigationStack({ stack: result.nextStack, next: marked(result.target, currentMarker.index, currentMarker.epoch), replace: true }), result, currentMarker };
}

let browserPaths = ['/external', '/sessions/123/analysis'];
let browserIndex = 1;
let appStack = [marked('/dashboard', 0), marked('/sessions/123', 1), marked('/sessions/123/analysis', 2)];
let browserState = applyAppBackToBrowser(browserPaths, browserIndex, appStack, marker(0, otherEpoch), '/dashboard');
assert.equal(browserState.result.mode, 'replace', 'stale CPL stack with external real browser entry behind current page never uses history.go');
assert.deepEqual(browserState.paths, ['/external', '/dashboard'], 'stale stack fallback stays inside CPL at the current browser index');
assert.equal(browserState.currentIndex, 1, 'stale stack fallback does not move back to the external entry');

browserPaths = ['/dashboard', '/sessions/123', '/sessions/123/analysis'];
browserIndex = 2;
appStack = [marked('/dashboard', 0), marked('/sessions/123', 1), marked('/sessions/123/analysis', 2)];
browserState = applyAppBackToBrowser(browserPaths, browserIndex, appStack, marker(2));
assert.equal(browserState.paths[browserState.currentIndex], '/sessions/123', 'browser lands on session after analysis app Back');
browserState.appStack = reconcilePopstateNavigationStack({ stack: browserState.appStack, next: marked(browserState.paths[browserState.currentIndex], 1) });
browserState = applyAppBackToBrowser(browserState.paths, browserState.currentIndex, browserState.appStack, marker(1));
assert.equal(browserState.paths[browserState.currentIndex], '/dashboard', 'second app Back lands on dashboard in browser simulation');
assert.equal(browserState.currentIndex, 0, 'app Back returns to original dashboard browser entry, not a new dashboard entry');

browserPaths = ['/dashboard', '/sessions/123', '/sessions/123/analysis'];
browserIndex = 2;
appStack = [marked('/dashboard', 0), marked('/sessions/123', 1), marked('/sessions/123/analysis', 2)];
browserState = applyAppBackToBrowser(browserPaths, browserIndex, appStack, marker(2));
assert.equal(browserState.currentIndex, 1, 'App Back followed by native Back starts from the previous browser entry');
browserIndex = browserState.currentIndex - 1;
assert.equal(browserState.paths[browserIndex], '/dashboard', 'native Back after app Back goes to dashboard instead of bouncing forward');

browserPaths = ['/dashboard', '/sessions/123', '/sessions/123/analysis'];
browserIndex = 1;
appStack = reconcilePopstateNavigationStack({ stack: [marked('/dashboard', 0), marked('/sessions/123', 1), marked('/sessions/123/analysis', 2)], next: marked('/sessions/123', 1) });
browserState = applyAppBackToBrowser(browserPaths, browserIndex, appStack, marker(1));
assert.equal(browserState.paths[browserState.currentIndex], '/dashboard', 'native Back followed by app Back remains correct');

browserPaths = ['/sessions/123/analysis'];
browserIndex = 0;
appStack = [marked('/sessions/123/analysis', 0)];
browserState = applyAppBackToBrowser(browserPaths, browserIndex, appStack, marker(0), '/dashboard');
assert.equal(browserState.result.mode, 'replace', 'direct deep-link fallback uses replace in browser simulation');
assert.deepEqual(browserState.paths, ['/dashboard'], 'direct deep-link fallback stays inside the app without adding a bad browser entry');
assert.equal(browserState.currentIndex, 0, 'direct deep-link fallback does not create a new history index');

assert.equal(isSafeInAppPrevious(marked('/login', 0), origin, '/dashboard'), false, 'login route is rejected as authenticated custom back target');
assert.equal(isSafeInAppPrevious(marked('/reset-password', 0), origin, '/dashboard'), false, 'reset-password route is rejected as authenticated custom back target');
assert.equal(isSafeInAppPrevious({ path: 'https://evil.example/', origin, historyEpoch: epoch, historyIndex: 0 }, origin, '/sessions/123'), false, 'external custom back path is rejected');
assert.equal(isSafeInAppPrevious({ path: '/settings', origin: 'https://evil.example', historyEpoch: epoch, historyIndex: 0 }, origin, '/dashboard'), false, 'external origin is rejected');

assert.equal(decideSwipeBackGesture({ startX: 29, startY: 10, currentX: 110, currentY: 12, viewportWidth: 390 }), 'cancel', 'swipe must start inside edge threshold');
assert.equal(decideSwipeBackGesture({ startX: 12, startY: 10, currentX: 88, currentY: 18, viewportWidth: 390 }), 'back', 'clear horizontal edge swipe goes back');
assert.equal(decideSwipeBackGesture({ startX: 12, startY: 10, currentX: 35, currentY: 90, viewportWidth: 390 }), 'cancel', 'vertical scroll cancels swipe');
assert.equal(decideSwipeBackGesture({ startX: 12, startY: 10, currentX: 52, currentY: 45, viewportWidth: 390 }), 'pending', 'ambiguous diagonal movement does not navigate');

const provider = readFileSync('app/components/navigation/AppNavigationProvider.tsx', 'utf8');
assert.match(provider, /withAppHistoryMarker\(state, marker\)/, 'provider preserves existing state while adding CPL marker');
assert.match(provider, /bootstrapMarker\(\)/, 'provider safely bootstraps the current CPL history entry');
assert.match(provider, /window\.history\.go\(-resolution\.historySteps\)/, 'provider uses real browser history for verified safe in-app previous routes');
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
