import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const homePage = readFileSync('app/page.tsx', 'utf8');
const homeEntry = readFileSync('app/components/HomeEntry.tsx', 'utf8');
const loginPage = readFileSync('app/login/page.tsx', 'utf8');
const entryHook = readFileSync('app/components/auth/useEntrySession.ts', 'utf8');
const startup = readFileSync('app/components/auth/EntryStartup.tsx', 'utf8');
const profileGate = readFileSync('app/components/ProfileGate.tsx', 'utf8');
const manifest = readFileSync('app/manifest.ts', 'utf8');
const serviceWorker = readFileSync('public/sw.js', 'utf8');

assert.match(homePage, /<HomeEntry \/>/, 'root route delegates to the auth-aware entry component');
assert.match(homeEntry, /useEntrySession\(\)/, 'root uses the shared persisted-session entry hook');
assert.match(homeEntry, /entrySession === "authenticated"[\s\S]*router\.replace\("\/dashboard"\)/, 'root authenticated entry replaces to dashboard');
assert.match(homeEntry, /entrySession !== "unauthenticated"[\s\S]*<EntryStartup \/>/, 'root renders neutral startup while auth state is unresolved');
assert.match(homeEntry, /entrySession !== "unauthenticated"[\s\S]*return <EntryStartup \/>;[\s\S]*heroCard publicHero/, 'root public landing is rendered only after unauthenticated resolution');
assert.doesNotMatch(homeEntry, /router\.push\("\/dashboard"\)/, 'root automatic entry routing does not push dashboard history');

assert.match(loginPage, /useEntrySession\(\)/, 'login uses the shared persisted-session entry hook');
assert.match(loginPage, /entrySession === "authenticated"[\s\S]*router\.replace\("\/dashboard"\)/, 'login authenticated entry replaces to dashboard');
assert.match(loginPage, /entrySession !== "unauthenticated"[\s\S]*<EntryStartup \/>/, 'login renders neutral startup while auth state is unresolved');
assert.match(loginPage, /entrySession !== "unauthenticated"[\s\S]*return <EntryStartup \/>;[\s\S]*<form className="card authCard"/, 'login form renders only after unauthenticated resolution');
assert.match(loginPage, /router\.replace\("\/dashboard"\)/, 'successful sign-in uses replace semantics');
assert.doesNotMatch(loginPage, /router\.push\("\/dashboard"\)/, 'login no longer pushes dashboard after sign-in');
assert.match(loginPage, /resetPasswordForEmail/, 'forgot-password flow remains present');
assert.match(loginPage, /signUp\(/, 'create-account flow remains present');
assert.match(loginPage, /LOGIN_HELP_MESSAGE/, 'login error messaging remains present');

assert.match(entryHook, /supabase\.auth\.getSession\(\)/, 'entry hook checks locally persisted Supabase session');
assert.match(entryHook, /onAuthStateChange/, 'entry hook responds to auth-state changes');
assert.match(entryHook, /active = false/, 'entry hook guards against stale async updates after unmount');
assert.match(entryHook, /listener\.subscription\.unsubscribe\(\)/, 'entry hook cleans up its auth subscription');
assert.doesNotMatch(entryHook, /getUser\(\)|sync_my_access_profile|user_access_profiles|shooter_profiles/, 'entry hook does not duplicate protected authorization/profile checks');
assert.match(startup, /Opening your app/, 'neutral startup state is app-like and minimal');

for (const route of ['COMPLETE_PROFILE_PATH', 'BETA_ACCESS_PATH', 'ONBOARDING_PROFILE_PATH']) {
  assert.match(profileGate, new RegExp(route), `ProfileGate still owns ${route} routing`);
}
assert.match(profileGate, /supabase\.auth\.getUser\(\)/, 'ProfileGate continues verified user lookup for protected pages');
assert.match(profileGate, /sync_my_access_profile/, 'ProfileGate continues beta access synchronization');
assert.match(profileGate, /isShooterProfileComplete/, 'ProfileGate continues shooter profile completion checks');

assert.match(manifest, /start_url:\s*"\/"/, 'PWA start_url stays rooted at the auth-aware entry route');
assert.match(serviceWorker, /const CACHE_PREFIX = "cpl-pwa-";/, 'service-worker caching ownership remains unchanged');
assert.match(serviceWorker, /pathname\.startsWith\("\/api\/"\)/, 'service worker still avoids API runtime caching');
assert.match(serviceWorker, /hostname\.includes\("supabase\.co"\)/, 'service worker still avoids Supabase runtime caching');

console.log('Auth entry routing checks passed');
