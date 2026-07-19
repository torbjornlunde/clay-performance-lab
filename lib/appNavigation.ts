export const APP_NAV_STACK_KEY = "cpl-app-nav-stack-v1";
export const DEFAULT_APP_BACK_FALLBACK = "/dashboard";

const PUBLIC_AUTH_ROUTES = new Set(["/", "/login", "/reset-password", "/join-beta", "/beta/access"]);

export type AppNavEntry = { path: string; origin: string };
export type SwipeDecision = "pending" | "back" | "cancel";

export function normalizeAppPath(path: string): string | null {
  if (!path || /^(https?:|mailto:|tel:|javascript:)/i.test(path)) return null;
  if (!path.startsWith("/")) return null;
  if (path.startsWith("//")) return null;
  return path;
}

export function isPublicAuthRoute(path: string): boolean {
  const pathname = path.split(/[?#]/)[0] || "/";
  return PUBLIC_AUTH_ROUTES.has(pathname);
}

export function isSafeInAppPrevious(entry: AppNavEntry | null | undefined, currentOrigin: string, currentPath: string): entry is AppNavEntry {
  if (!entry) return false;
  const path = normalizeAppPath(entry.path);
  if (!path) return false;
  if (entry.origin !== currentOrigin) return false;
  if (path === currentPath) return false;
  if (isPublicAuthRoute(path)) return false;
  return true;
}

export function resolveAppBackTarget(input: { stack: AppNavEntry[]; origin: string; currentPath: string; fallback?: string }): { target: string; usedFallback: boolean } {
  const fallback = normalizeAppPath(input.fallback || DEFAULT_APP_BACK_FALLBACK) || DEFAULT_APP_BACK_FALLBACK;
  for (let index = input.stack.length - 2; index >= 0; index -= 1) {
    const candidate = input.stack[index];
    if (isSafeInAppPrevious(candidate, input.origin, input.currentPath)) {
      return { target: candidate.path, usedFallback: false };
    }
  }
  return { target: fallback, usedFallback: true };
}

export function updateAppNavigationStack(input: { stack: AppNavEntry[]; next: AppNavEntry; replace?: boolean; maxLength?: number }): AppNavEntry[] {
  const maxLength = input.maxLength ?? 24;
  const path = normalizeAppPath(input.next.path);
  if (!path) return input.stack.slice(-maxLength);
  const next = { ...input.next, path };
  const stack = input.stack.filter((entry) => normalizeAppPath(entry.path));
  const last = stack[stack.length - 1];
  if (last?.path === next.path && last.origin === next.origin) return stack.slice(-maxLength);
  const updated = input.replace && stack.length ? [...stack.slice(0, -1), next] : [...stack, next];
  return updated.slice(-maxLength);
}

export function shouldIgnoreSwipeTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, button, a, [contenteditable="true"], [role="slider"], [role="spinbutton"], [data-cpl-swipe-back-opt-out], [data-cpl-horizontal-interaction]'));
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
}

export function decideSwipeBackGesture(input: { startX: number; startY: number; currentX: number; currentY: number; viewportWidth: number; edgeThreshold?: number; horizontalThreshold?: number; verticalCancelThreshold?: number }): SwipeDecision {
  const edgeThreshold = input.edgeThreshold ?? 28;
  const horizontalThreshold = input.horizontalThreshold ?? 64;
  const verticalCancelThreshold = input.verticalCancelThreshold ?? 42;
  if (input.startX > edgeThreshold || input.startX < 0 || input.startX > input.viewportWidth) return "cancel";
  const dx = input.currentX - input.startX;
  const dy = Math.abs(input.currentY - input.startY);
  if (dy > verticalCancelThreshold && dy > Math.abs(dx) * 0.8) return "cancel";
  if (dx >= horizontalThreshold && dx > dy * 1.6) return "back";
  if (dx < -12) return "cancel";
  return "pending";
}
