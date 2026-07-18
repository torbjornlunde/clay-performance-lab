"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type PwaInstallContextValue = {
  promptEvent: BeforeInstallPromptEvent | null;
  clearPromptEvent: () => void;
};

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    function capturePrompt(event: Event) {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    }

    function clearInstalledPrompt() {
      setPromptEvent(null);
    }

    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", clearInstalledPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", clearInstalledPrompt);
    };
  }, []);

  const value = useMemo<PwaInstallContextValue>(
    () => ({ promptEvent, clearPromptEvent: () => setPromptEvent(null) }),
    [promptEvent],
  );

  return <PwaInstallContext.Provider value={value}>{children}</PwaInstallContext.Provider>;
}

export function usePwaInstallPrompt() {
  const value = useContext(PwaInstallContext);
  if (!value) throw new Error("usePwaInstallPrompt must be used inside PwaInstallProvider.");
  return value;
}
