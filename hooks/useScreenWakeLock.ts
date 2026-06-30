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
  const releaseInFlightRef = useRef<Promise<void> | null>(null);
  const requestAfterInFlightRef = useRef(false);
  const mountedRef = useRef(false);

  const releaseWakeLock = useCallback(() => {
    const sentinel = sentinelRef.current;
    sentinelRef.current = null;
    if (mountedRef.current) setIsActive(false);

    if (releaseInFlightRef.current) return releaseInFlightRef.current;
    if (!sentinel || sentinel.released) return Promise.resolve();

    const releasePromise = sentinel.release().catch(() => {
      // Wake Lock release failures should not interrupt score logging.
    });
    releaseInFlightRef.current = releasePromise;

    void releasePromise.finally(() => {
      if (releaseInFlightRef.current === releasePromise) {
        releaseInFlightRef.current = null;
      }
    });

    return releasePromise;
  }, []);

  const requestWakeLock = useCallback(async function requestWakeLockInternal() {
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
    if (requestInFlightRef.current) {
      requestAfterInFlightRef.current = true;
      return requestInFlightRef.current;
    }

    const requestPromise = (async () => {
      try {
        const releaseInFlight = releaseInFlightRef.current;
        if (releaseInFlight) {
          await releaseInFlight;
          if (
            !mountedRef.current ||
            !enabledRef.current ||
            !isDocumentVisible()
          ) {
            return;
          }
        }

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

        if (requestAfterInFlightRef.current) {
          requestAfterInFlightRef.current = false;
          const activeSentinel = sentinelRef.current;
          if (
            mountedRef.current &&
            enabledRef.current &&
            isDocumentVisible() &&
            (!activeSentinel || activeSentinel.released)
          ) {
            void requestWakeLockInternal();
          }
        }
      }
    })();

    requestInFlightRef.current = requestPromise;
    return requestPromise;
  }, []);

  const setEnabled = useCallback(
    (enabled: boolean) => {
      enabledRef.current = enabled;
      setIsEnabled(enabled);
      if (!enabled) {
        requestAfterInFlightRef.current = false;
        void releaseWakeLock();
      }
    },
    [releaseWakeLock],
  );

  useEffect(() => {
    mountedRef.current = true;
    setIsSupported(canUseWakeLock());

    return () => {
      mountedRef.current = false;
      requestAfterInFlightRef.current = false;
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
