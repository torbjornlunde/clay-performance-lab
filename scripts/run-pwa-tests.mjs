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

const installCard = readFileSync('app/components/InstallAppCard.tsx', 'utf8');
assert.match(installCard, /if \(standalone \|\| dismissed \|\| \(!promptEvent && !appleMobile\)\) return null;/, 'install UI is hidden in standalone mode');
assert.match(installCard, /beforeinstallprompt/, 'install UI captures beforeinstallprompt');
assert.match(installCard, /Open the Share menu in Safari and choose Add to Home Screen\./, 'iOS install guidance is present');

const hook = readFileSync('lib/pwa/useStandaloneMode.ts', 'utf8');
assert.match(hook, /display-mode: standalone/, 'standalone hook checks display-mode');
assert.match(hook, /navigator\.standalone === true/, 'standalone hook checks iOS navigator.standalone');

const sw = readFileSync('public/sw.js', 'utf8');
assert.match(sw, /pathname\.startsWith\("\/api\/"\)/, 'service worker excludes app API routes');
assert.match(sw, /hostname\.includes\("supabase\.co"\)/, 'service worker excludes Supabase routes');
assert.doesNotMatch(sw, /cache\.put\(request|caches\.open\([^)]*\)[\s\S]*fetch\(request\)[\s\S]*cache\.put/, 'service worker does not runtime-cache fetched user data');

console.log('PWA checks passed');
