"use client";

import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { APP_NAV_STACK_KEY, DEFAULT_APP_BACK_FALLBACK, decideSwipeBackGesture, isStandaloneDisplay, reconcilePopstateNavigationStack, resolveAppBackTarget, shouldIgnoreSwipeTarget, updateAppNavigationStack, type AppNavEntry } from "@/lib/appNavigation";

type AppBackContextValue = { goBack: (fallback?: string) => boolean; backTarget: (fallback?: string) => string };
const AppBackContext = createContext<AppBackContextValue | null>(null);

function readStack(): AppNavEntry[] {
  try { return JSON.parse(sessionStorage.getItem(APP_NAV_STACK_KEY) || "[]"); } catch { return []; }
}
function writeStack(stack: AppNavEntry[]) { sessionStorage.setItem(APP_NAV_STACK_KEY, JSON.stringify(stack)); }

export function AppNavigationProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const navigatingRef = useRef(false);
  const replaceRef = useRef(false);
  const popstateRef = useRef(false);
  const touchRef = useRef<{ x: number; y: number; active: boolean; fired: boolean } | null>(null);
  const path = `${pathname || "/"}${searchParams?.toString() ? `?${searchParams.toString()}` : ""}`;

  useEffect(() => {
    const originalPush = history.pushState;
    const originalReplace = history.replaceState;
    history.pushState = function patchedPushState(...args) { replaceRef.current = false; return originalPush.apply(this, args); };
    history.replaceState = function patchedReplaceState(...args) { replaceRef.current = true; return originalReplace.apply(this, args); };
    const onPopState = () => { popstateRef.current = true; };
    window.addEventListener("popstate", onPopState);
    return () => { history.pushState = originalPush; history.replaceState = originalReplace; window.removeEventListener("popstate", onPopState); };
  }, []);

  useEffect(() => {
    const next = { path, origin: window.location.origin };
    const stack = popstateRef.current
      ? reconcilePopstateNavigationStack({ stack: readStack(), next })
      : updateAppNavigationStack({ stack: readStack(), next, replace: replaceRef.current });
    writeStack(stack);
    replaceRef.current = false;
    popstateRef.current = false;
    navigatingRef.current = false;
  }, [path]);

  const backTarget = useCallback((fallback = DEFAULT_APP_BACK_FALLBACK) => resolveAppBackTarget({ stack: readStack(), origin: window.location.origin, currentPath: path, fallback }).target, [path]);
  const goBack = useCallback((fallback = DEFAULT_APP_BACK_FALLBACK) => {
    if (navigatingRef.current) return false;
    const resolution = resolveAppBackTarget({ stack: readStack(), origin: window.location.origin, currentPath: path, fallback });
    if (!resolution.canNavigate) {
      navigatingRef.current = false;
      return false;
    }
    navigatingRef.current = true;
    writeStack(resolution.nextStack);
    router.push(resolution.target);
    return true;
  }, [path, router]);

  useEffect(() => {
    if (!isStandaloneDisplay() || !navigator.maxTouchPoints) return;
    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || shouldIgnoreSwipeTarget(event.target)) { touchRef.current = null; return; }
      const touch = event.touches[0];
      touchRef.current = { x: touch.clientX, y: touch.clientY, active: touch.clientX <= 28, fired: false };
    };
    const onMove = (event: TouchEvent) => {
      const state = touchRef.current;
      if (!state?.active || state.fired || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const decision = decideSwipeBackGesture({ startX: state.x, startY: state.y, currentX: touch.clientX, currentY: touch.clientY, viewportWidth: window.innerWidth });
      if (decision === "cancel") state.active = false;
      if (decision === "back") {
        const didNavigate = goBack();
        if (didNavigate) { state.fired = true; event.preventDefault(); }
        else state.active = false;
      }
    };
    const onEnd = () => { touchRef.current = null; };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => { window.removeEventListener("touchstart", onStart); window.removeEventListener("touchmove", onMove); window.removeEventListener("touchend", onEnd); window.removeEventListener("touchcancel", onEnd); };
  }, [goBack]);

  const value = useMemo(() => ({ goBack, backTarget }), [goBack, backTarget]);
  return <AppBackContext.Provider value={value}>{children}</AppBackContext.Provider>;
}

export function useAppBack() {
  const context = useContext(AppBackContext);
  if (!context) throw new Error("useAppBack must be used inside AppNavigationProvider");
  return context;
}
