import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const manifest = readFileSync('app/manifest.ts', 'utf8');
assert.match(manifest, /name:\s*"Clay Performance Lab"/, 'manifest uses full app name');
assert.match(manifest, /display:\s*"standalone"/, 'manifest display is standalone');
for (const size of ['192x192', '512x512']) assert.match(manifest, new RegExp(`sizes:\\s*"${size}"`), `manifest includes ${size} icon`);
assert.match(manifest, /src:\s*"\/pwa-icons\/v1\/192"[\s\S]*purpose:\s*"any"/, 'manifest references approved versioned 192 icon');
assert.match(manifest, /src:\s*"\/pwa-icons\/v1\/512"[\s\S]*purpose:\s*"any"/, 'manifest references approved versioned 512 icon');
assert.match(manifest, /src:\s*"\/pwa-icons\/v1\/maskable"[\s\S]*purpose:\s*"maskable"/, 'manifest references distinct versioned maskable icon');
assert.ok(existsSync('app/pwa-icons/v1/[icon]/route.tsx'), 'versioned approved icon route exists');
assert.ok(!existsSync('app/pwa-icons/[icon]/route.tsx'), 'obsolete unversioned icon route is removed');
assert.ok(existsSync('lib/pwa/iconConfig.ts'), 'shared icon size and safe-padding configuration exists');
assert.ok(existsSync('lib/pwa/approvedIconArtwork.ts'), 'approved CPL logo artwork exists as reviewable text');

const iconRoute = readFileSync('app/pwa-icons/v1/[icon]/route.tsx', 'utf8');
const iconArtwork = readFileSync('lib/pwa/approvedIconArtwork.ts', 'utf8');
assert.match(iconRoute, /ImageResponse/, 'icon route generates PNG image responses');
assert.match(iconRoute, /width:\s*size,[\s\S]*height:\s*size/, 'icon response dimensions come from route config');
assert.match(iconRoute, /CPL_APPROVED_ICON_PATH/, 'icon route renders the approved CP and clay artwork');
assert.match(iconRoute, /CPL_APPROVED_ICON_VIEW_BOX/, 'icon route uses the approved artwork crop');
assert.match(iconRoute, /Cache-Control[\s\S]*immutable/, 'versioned icon responses are immutable-cacheable');
assert.match(iconRoute, /#030405/, 'icon uses the approved black background');
assert.match(iconRoute, /#d89b2b|#fff0a0/, 'icon uses metallic gold branding');
assert.match(iconArtwork, /CPL_APPROVED_ICON_PATH = `M /, 'approved artwork contains vector path data');
assert.ok(iconArtwork.length > 2500, 'approved artwork is substantive rather than a placeholder monogram');
assert.doesNotMatch(iconArtwork, />LAB<|CP\/LAB|subtitle/i, 'approved app icon does not include the old LAB text lockup');

const layout = readFileSync('app/layout.tsx', 'utf8');
const provider = readFileSync('app/components/PwaInstallProvider.tsx', 'utf8');
const installCard = readFileSync('app/components/InstallAppCard.tsx', 'utf8');
const authHeader = readFileSync('app/components/AuthHeader.tsx', 'utf8');
assert.match(layout, /statusBarStyle:\s*"black"/, 'installed iOS app uses a non-translucent status bar to prevent visible scroll-underlap');
assert.match(layout, /url:\s*"\/pwa-icons\/v1\/192"/, 'browser icon metadata uses the approved versioned icon');
assert.match(layout, /url:\s*"\/pwa-icons\/v1\/apple"[\s\S]*180x180/, 'Apple touch icon metadata uses the approved versioned icon');
assert.match(layout, /shortcut:[\s\S]*\/pwa-icons\/v1\/192/, 'shortcut icon metadata uses the approved branding');
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
assert.match(provider, /else {\r?\n\s*setDialogOpen\(true\)/, 'dismissed install choices do not permanently hide future install attempts');
assert.match(provider, /Open Clay Performance Lab in Safari first, then follow the steps below\./, 'non-Safari iOS browsers instruct users to open Safari first');
for (const term of ['Safari', 'Share', 'Add to Home Screen', 'Open as Web App', 'Add']) assert.match(provider, new RegExp(term), `iOS instructions include ${term}`);
assert.doesNotMatch(installCard, />Not now<\/button>/, 'Settings no longer presents Not now as the only useful action');
assert.match(installCard, /Show installation steps/, 'Settings uses a clear iOS instruction action');
assert.match(installCard, /Install app/, 'Settings uses a clear Android install action');

const hook = readFileSync('lib/pwa/useStandaloneMode.ts', 'utf8');
assert.match(hook, /display-mode: standalone/, 'standalone hook checks display-mode');
assert.match(hook, /navigator\.standalone === true/, 'standalone hook checks iOS navigator.standalone');

const css = readFileSync('app/globals.css', 'utf8');
assert.match(css, /@media all and \(display-mode: standalone\)[\s\S]*body::before[\s\S]*background:\s*var\(--header-bg\)/, 'standalone iOS safe-area backdrop uses theme-aware header tokens');

const sw = readFileSync('public/sw.js', 'utf8');
assert.match(sw, /const CACHE_PREFIX = "cpl-pwa-";/, 'service worker owns only cpl-pwa-* caches');
assert.match(sw, /const CACHE_VERSION = "v3";/, 'service worker cache version is bumped for the offline Score Sheet shell');
assert.match(sw, /key\.startsWith\(CACHE_PREFIX\) && key !== STATIC_CACHE/, 'service worker cleanup only targets old owned caches');
assert.doesNotMatch(sw, /!key\.startsWith\(CACHE_VERSION\)/, 'service worker no longer deletes unrelated caches');
for (const unrelated of ['workbox-precache-v9', 'future-offline-sync', 'supabase-cache']) {
  const CACHE_PREFIX = 'cpl-pwa-';
  const STATIC_CACHE = 'cpl-pwa-v3-static';
  const shouldDelete = unrelated.startsWith(CACHE_PREFIX) && unrelated !== STATIC_CACHE;
  assert.equal(shouldDelete, false, `unrelated cache ${unrelated} is never deleted`);
}
assert.equal('cpl-pwa-v2-static'.startsWith('cpl-pwa-') && 'cpl-pwa-v2-static' !== 'cpl-pwa-v3-static', true, 'old CPL cache is eligible for cleanup');
assert.match(sw, /cache\.addAll\(REQUIRED_STATIC_ASSETS\)/, 'offline fallback is required during install');
assert.match(sw, /Promise\.allSettled\(OPTIONAL_STATIC_ASSETS\.map/, 'optional icons do not fail the whole install');
for (const path of ['/pwa-icons/v1/192', '/pwa-icons/v1/512', '/pwa-icons/v1/maskable', '/pwa-icons/v1/apple']) {
  assert.ok(sw.includes(`"${path}"`), `service worker precaches ${path}`);
}
assert.match(sw, /icon:\s*"\/pwa-icons\/v1\/192"[\s\S]*badge:\s*"\/pwa-icons\/v1\/192"/, 'Web Push uses the approved app icon');
assert.doesNotMatch([manifest, layout, sw].join('\n'), /\/pwa-icons\/(192|512|maskable|apple)"/, 'old unversioned icon paths are no longer referenced');
assert.match(sw, /pathname\.startsWith\("\/api\/"\)/, 'service worker excludes app API routes');
assert.match(sw, /hostname\.includes\("supabase\.co"\)/, 'service worker excludes Supabase routes');
assert.match(sw, /if \(request\.method !== "GET" \|\| isUnsafeToCache\(url\)\) return;/, 'unsafe API and Supabase requests exit before any runtime cache strategy');
assert.match(sw, /isScoreSheetRoute\(url\)[\s\S]*scoreSheetNavigationResponse\(request\)/, 'only an already-used Training or Competition Score Sheet navigation gets route-shell recovery');
assert.match(sw, /\^\\\/\(training\|competition\)-score-sheets\\\/\[\^\/\]\+/, 'Score Sheet route caching excludes list, result-claim, and unrelated authenticated routes');
assert.match(sw, /url\.pathname\.startsWith\("\/_next\/static\/"\)/, 'immutable Next.js app-shell assets can reopen the cached route offline');
assert.doesNotMatch(sw, /fetch\(request\)[\s\S]*cache\.put\(request[\s\S]*pathname\.startsWith\("\/api\/"\)/, 'no generic fetched user-data cache is introduced');

const whatsNew = readFileSync('lib/updates/whatsNew.ts', 'utf8');
assert.match(whatsNew, /id:\s*"v4\.08\.26"[\s\S]*Official CPL app icon/, 'What’s new includes the app-icon branding release');

console.log('PWA checks passed');
