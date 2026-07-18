# Progressive Web App installation

Clay Performance Lab is installable as a mobile Progressive Web App. The PWA foundation is intentionally lightweight so it does not interfere with authenticated data, Supabase requests, AI routes, or local scorecard workflows.

## iPhone and iPad

1. Open Clay Performance Lab in Safari.
2. Open the Share menu.
3. Choose **Add to Home Screen**.
4. Keep the app name as **Clay Performance Lab** and confirm.

When launched from the home-screen icon, the app uses standalone display with Apple web app metadata and safe-area spacing for notches and Dynamic Island devices.

## Android

On supported Android browsers, the Settings page can show an **Install app** action after the browser provides the native install prompt. The app does not show aggressive popups and hides install guidance when already running in standalone mode.

## Files

- Manifest: `app/manifest.ts`
- Generated app icon URLs: `/pwa-icons/192`, `/pwa-icons/512`, `/pwa-icons/maskable`, `/pwa-icons/apple`
- Generated icon route: `app/pwa-icons/[icon]/route.tsx`
- Shared icon configuration: `lib/pwa/iconConfig.ts`
- Service worker: `public/sw.js`
- Offline fallback: `public/offline.html`
- Standalone detection hook: `lib/pwa/useStandaloneMode.ts`

## Offline limitations

The service worker caches only a small set of static PWA assets and the offline fallback page. It does not cache authenticated API responses, Supabase requests, AI API routes, or dynamic user-specific pages. Broader offline synchronization for live logging remains a separate roadmap item.
