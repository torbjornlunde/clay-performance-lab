import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync('lib/appNavigation.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
new Function('exports', 'module', js)(module.exports, module);
const { resolveAppBackTarget, updateAppNavigationStack, decideSwipeBackGesture, isSafeInAppPrevious } = module.exports;
const origin = 'https://app.example.test';

let stack = updateAppNavigationStack({ stack: [], next: { path: '/dashboard', origin } });
stack = updateAppNavigationStack({ stack, next: { path: '/sessions/123', origin } });
assert.deepEqual(resolveAppBackTarget({ stack, origin, currentPath: '/sessions/123', fallback: '/dashboard' }), { target: '/dashboard', usedFallback: false }, 'uses safe previous in-app route');

assert.deepEqual(resolveAppBackTarget({ stack: [{ path: '/sessions/123', origin }], origin, currentPath: '/sessions/123', fallback: '/dashboard' }), { target: '/dashboard', usedFallback: true }, 'direct deep link uses fallback');

stack = updateAppNavigationStack({ stack: [{ path: '/login', origin }], next: { path: '/dashboard', origin }, replace: true });
assert.equal(stack.length, 1, 'auth startup replace does not retain login entry');
assert.deepEqual(resolveAppBackTarget({ stack, origin, currentPath: '/dashboard', fallback: '/dashboard' }), { target: '/dashboard', usedFallback: true }, 'auth startup fallback avoids login loop');

assert.equal(decideSwipeBackGesture({ startX: 29, startY: 10, currentX: 110, currentY: 12, viewportWidth: 390 }), 'cancel', 'swipe must start inside edge threshold');
assert.equal(decideSwipeBackGesture({ startX: 12, startY: 10, currentX: 88, currentY: 18, viewportWidth: 390 }), 'back', 'clear horizontal edge swipe goes back');
assert.equal(decideSwipeBackGesture({ startX: 12, startY: 10, currentX: 35, currentY: 90, viewportWidth: 390 }), 'cancel', 'vertical scroll cancels swipe');
assert.equal(decideSwipeBackGesture({ startX: 12, startY: 10, currentX: 52, currentY: 45, viewportWidth: 390 }), 'pending', 'ambiguous diagonal movement does not navigate');

assert.equal(isSafeInAppPrevious({ path: 'https://evil.example/', origin }, origin, '/sessions/123'), false, 'external custom back path is rejected');
assert.equal(isSafeInAppPrevious({ path: '/login', origin }, origin, '/dashboard'), false, 'login route is rejected as authenticated custom back target');
assert.equal(isSafeInAppPrevious({ path: '/settings', origin: 'https://evil.example' }, origin, '/dashboard'), false, 'external origin is rejected');

const provider = readFileSync('app/components/navigation/AppNavigationProvider.tsx', 'utf8');
assert.match(provider, /navigatingRef\.current/, 'provider guards against double navigation');
assert.match(provider, /shouldIgnoreSwipeTarget\(event\.target\)/, 'provider checks interactive and opt-out targets');
assert.match(source, /data-cpl-swipe-back-opt-out/, 'explicit opt-out marker is documented in target selector');
assert.match(source, /input, textarea, select, button, a/, 'interactive controls are ignored by swipe detection');
assert.match(provider, /history\.replaceState = function patchedReplaceState/, 'provider observes replaceState for auth/startup compatibility');
assert.match(provider, /router\.push\(backTarget\(fallback\)\)/, 'provider navigates only to resolved safe app target');

console.log('App navigation checks passed');
