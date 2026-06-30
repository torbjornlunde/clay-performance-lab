"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type WakeLockSentinelLike = EventTarget & {
  released: boolean;
  release: () => Promise<void>;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
};

function canUseWakeLock() {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}

function isDocumentVisible() {
  return (
    typeof document !== "undefined" && document.visibilityState === "visible"
  );
}

export function useScreenWakeLock(defaultEnabled = true) {
  const [isSupported, setIsSupported] = useState(false);
  const [isEnabled, setIsEnabled] = useState(defaultEnabled);
  const [isActive, setIsActive] = useState(false);
  const enabledRef = useRef(defaultEnabled);
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);
  const requestInFlightRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(false);

  const releaseWakeLock = useCallback(async () => {
    const sentinel = sentinelRef.current;
    sentinelRef.current = null;
    if (mountedRef.current) setIsActive(false);

    if (sentinel && !sentinel.released) {
      try {
        await sentinel.release();
      } catch {
        // Wake Lock release failures should not interrupt score logging.
      }
    }
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (
      !mountedRef.current ||
      !enabledRef.current ||
      !canUseWakeLock() ||
      !isDocumentVisible()
    ) {
      return;
    }

    const currentSentinel = sentinelRef.current;
    if (currentSentinel && !currentSentinel.released) return;
    if (requestInFlightRef.current) return requestInFlightRef.current;

    const requestPromise = (async () => {
      try {
        const wakeLockApi = (navigator as NavigatorWithWakeLock).wakeLock;
        const sentinel = await wakeLockApi?.request("screen");
        if (!sentinel) return;

        if (
          !mountedRef.current ||
          !enabledRef.current ||
          !isDocumentVisible()
        ) {
          try {
            await sentinel.release();
          } catch {
            // Ignore release failures after cancellation.
          }
          return;
        }

        sentinelRef.current = sentinel;
        setIsActive(!sentinel.released);
        sentinel.addEventListener("release", () => {
          if (sentinelRef.current === sentinel) sentinelRef.current = null;
          if (mountedRef.current) setIsActive(false);
        });
      } catch {
        if (mountedRef.current) setIsActive(false);
      } finally {
        requestInFlightRef.current = null;
      }
    })();

    requestInFlightRef.current = requestPromise;
    return requestPromise;
  }, []);

  const setEnabled = useCallback(
    (enabled: boolean) => {
      enabledRef.current = enabled;
      setIsEnabled(enabled);
      if (!enabled) void releaseWakeLock();
    },
    [releaseWakeLock],
  );

  useEffect(() => {
    mountedRef.current = true;
    setIsSupported(canUseWakeLock());

    return () => {
      mountedRef.current = false;
      void releaseWakeLock();
    };
  }, [releaseWakeLock]);

  useEffect(() => {
    if (!isEnabled) {
      void releaseWakeLock();
      return;
    }

    void requestWakeLock();
  }, [isEnabled, releaseWakeLock, requestWakeLock]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    function handleVisibilityChange() {
      if (!isDocumentVisible()) {
        void releaseWakeLock();
        return;
      }

      if (enabledRef.current) void requestWakeLock();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [releaseWakeLock, requestWakeLock]);

  return {
    isSupported,
    isEnabled,
    isActive,
    setEnabled,
    requestWakeLock,
    releaseWakeLock,
  };
}
