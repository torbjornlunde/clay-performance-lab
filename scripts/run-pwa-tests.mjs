import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const manifest = readFileSync('app/manifest.ts', 'utf8');
assert.match(manifest, /name:\s*"Clay Performance Lab"/, 'manifest uses full app name');
assert.match(manifest, /display:\s*"standalone"/, 'manifest display is standalone');
for (const size of ['192x192', '512x512']) assert.match(manifest, new RegExp(`sizes:\\s*"${size}"`), `manifest includes ${size} icon`);
assert.match(manifest, /src:\s*"\/pwa-icons\/192"/, 'manifest references generated 192 icon route');
assert.match(manifest, /src:\s*"\/pwa-icons\/512"/, 'manifest references generated 512 icon route');
assert.match(manifest, /src:\s*"\/pwa-icons\/maskable"[\s\S]*purpose:\s*"maskable"/, 'manifest references generated maskable icon route');
assert.ok(existsSync('app/pwa-icons/[icon]/route.tsx'), 'generated icon route exists');
assert.ok(existsSync('lib/pwa/iconConfig.ts'), 'shared icon configuration exists');

const iconRoute = readFileSync('app/pwa-icons/[icon]/route.tsx', 'utf8');
assert.match(iconRoute, /ImageResponse/, 'icon route generates PNG image responses');
assert.match(iconRoute, /width:\s*size, height:\s*size/, 'icon response dimensions come from route config');
assert.match(iconRoute, /#05070b|#0d141d/, 'icon uses dark brand background');
assert.match(iconRoute, /#d8a53a|#f5cf6a/, 'icon uses champagne/gold brand colors');

const layout = readFileSync('app/layout.tsx', 'utf8');
const provider = readFileSync('app/components/PwaInstallProvider.tsx', 'utf8');
const installCard = readFileSync('app/components/InstallAppCard.tsx', 'utf8');
const authHeader = readFileSync('app/components/AuthHeader.tsx', 'utf8');
assert.match(layout, /<PwaInstallProvider>[\s\S]*<ProfileGate>/, 'root layout mounts the PWA install provider before Settings can mount');
assert.match(provider, /window\.addEventListener\("beforeinstallprompt", capturePrompt\)/, 'beforeinstallprompt is captured globally');
assert.match(provider, /event\.preventDefault\(\)/, 'global beforeinstallprompt capture prevents the browser mini-infobar');
assert.match(provider, /setPromptEvent\(event as BeforeInstallPromptEvent\)/, 'global provider stores the deferred prompt event');
assert.match(installCard, /usePwaInstallPrompt\(\)/, 'Settings install card consumes the globally captured prompt');
assert.doesNotMatch(installCard, /addEventListener\("beforeinstallprompt"/, 'Settings install card does not wait to capture beforeinstallprompt itself');
assert.match(authHeader, /usePwaInstallPrompt\(\)/, 'authenticated global menu consumes the reusable PWA install state');
assert.match(authHeader, />Install app<\/button>/, 'authenticated browser-mode user can discover Install app directly from the global menu');
assert.match(authHeader, /\{installAvailable \? <button role="menuitem"/, 'global Install app menu item is hidden when installation is unavailable, including standalone mode');
assert.match(installCard, /localStorage\.getItem\(DISMISSED_KEY\) === "1"/, 'Settings promotional hint reads persisted dismissal from local storage');
assert.match(installCard, /if \(hintDismissed\) return null;/, 'stored promotional-hint dismissal suppresses the Settings promotional card on iOS and every other platform');
assert.doesNotMatch(installCard, /hintDismissed && !promptEvent && !iosDevice/, 'Settings hint dismissal is not dependent on iOS or prompt availability');
assert.doesNotMatch(authHeader, /cpl-install-hint-dismissed|DISMISSED_KEY|hintDismissed/, 'stored promotional-hint dismissal does not hide the explicit global Install app action');
assert.match(provider, /await promptEvent\.prompt\(\)/, 'Android with a valid deferred prompt can invoke prompt() from the explicit install action');
assert.match(provider, /const choice = await promptEvent\.userChoice;[\s\S]*clearPromptEvent\(\);/, 'consumed deferred prompt is cleared after userChoice');
assert.match(provider, /choice\.outcome === "accepted"[\s\S]*setDialogOpen\(false\)/, 'accepted install choices close the install dialog');
assert.match(provider, /else {\n        setDialogOpen\(true\)/, 'dismissed install choices do not permanently hide future install attempts');
assert.match(provider, /Open Clay Performance Lab in Safari first, then follow the steps below\./, 'non-Safari iOS browsers instruct users to open Safari first');
for (const term of ['Safari', 'Share', 'Add to Home Screen', 'Open as Web App', 'Add']) assert.match(provider, new RegExp(term), `iOS instructions include ${term}`);
assert.doesNotMatch(installCard, />Not now<\/button>/, 'Settings no longer presents Not now as the only useful action');
assert.match(installCard, /Show installation steps/, 'Settings uses a clear iOS instruction action');
assert.match(installCard, /Install app/, 'Settings uses a clear Android install action');

const hook = readFileSync('lib/pwa/useStandaloneMode.ts', 'utf8');
assert.match(hook, /display-mode: standalone/, 'standalone hook checks display-mode');
assert.match(hook, /navigator\.standalone === true/, 'standalone hook checks iOS navigator.standalone');

const sw = readFileSync('public/sw.js', 'utf8');
assert.match(sw, /const CACHE_PREFIX = "cpl-pwa-";/, 'service worker owns only cpl-pwa-* caches');
assert.match(sw, /key\.startsWith\(CACHE_PREFIX\) && key !== STATIC_CACHE/, 'service worker cleanup only targets old owned caches');
assert.doesNotMatch(sw, /!key\.startsWith\(CACHE_VERSION\)/, 'service worker no longer deletes unrelated caches');
for (const unrelated of ['workbox-precache-v9', 'future-offline-sync', 'supabase-cache']) {
  const CACHE_PREFIX = 'cpl-pwa-';
  const STATIC_CACHE = 'cpl-pwa-v1-static';
  const shouldDelete = unrelated.startsWith(CACHE_PREFIX) && unrelated !== STATIC_CACHE;
  assert.equal(shouldDelete, false, `unrelated cache ${unrelated} is never deleted`);
}
assert.equal('cpl-pwa-v0-static'.startsWith('cpl-pwa-') && 'cpl-pwa-v0-static' !== 'cpl-pwa-v1-static', true, 'old cpl-pwa cache is eligible for cleanup');
assert.match(sw, /cache\.addAll\(REQUIRED_STATIC_ASSETS\)/, 'offline fallback is required during install');
assert.match(sw, /Promise\.allSettled\(OPTIONAL_STATIC_ASSETS\.map/, 'optional generated icons do not fail the whole install');
assert.match(sw, /pathname\.startsWith\("\/api\/"\)/, 'service worker excludes app API routes');
assert.match(sw, /hostname\.includes\("supabase\.co"\)/, 'service worker excludes Supabase routes');
assert.doesNotMatch(sw, /cache\.put\(request|caches\.open\([^)]*\)[\s\S]*fetch\(request\)[\s\S]*cache\.put/, 'service worker does not runtime-cache fetched user data');

console.log('PWA checks passed');
