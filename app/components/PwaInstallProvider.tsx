"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useStandaloneMode } from "@/lib/pwa/useStandaloneMode";

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type PwaInstallContextValue = {
  promptEvent: BeforeInstallPromptEvent | null;
  clearPromptEvent: () => void;
  installAvailable: boolean;
  iosDevice: boolean;
  iosSafari: boolean;
  standalone: boolean;
  openInstallExperience: () => Promise<void>;
};

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);

function isAppleMobile() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isIosSafariBrowser() {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent;
  return isAppleMobile() && /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent);
}

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const standalone = useStandaloneMode();
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosDevice, setIosDevice] = useState(false);
  const [iosSafari, setIosSafari] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setIosDevice(isAppleMobile());
    setIosSafari(isIosSafariBrowser());
  }, []);

  useEffect(() => {
    function capturePrompt(event: Event) {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
      setStatus("");
    }

    function clearInstalledPrompt() {
      setPromptEvent(null);
      setDialogOpen(false);
    }

    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", clearInstalledPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", clearInstalledPrompt);
    };
  }, []);

  const clearPromptEvent = () => setPromptEvent(null);

  async function openInstallExperience() {
    if (standalone) return;
    if (promptEvent) {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      clearPromptEvent();
      if (choice.outcome === "accepted") {
        setDialogOpen(false);
        setStatus("Install started.");
      } else {
        setDialogOpen(true);
        setStatus("Install was dismissed. You can try again from the menu when your browser offers installation again.");
      }
      return;
    }
    setStatus("");
    setDialogOpen(true);
  }

  const value = useMemo<PwaInstallContextValue>(
    () => ({
      promptEvent,
      clearPromptEvent,
      installAvailable: !standalone,
      iosDevice,
      iosSafari,
      standalone,
      openInstallExperience,
    }),
    [promptEvent, standalone, iosDevice, iosSafari],
  );

  return (
    <PwaInstallContext.Provider value={value}>
      {children}
      <InstallAppDialog open={dialogOpen && !standalone} iosDevice={iosDevice} iosSafari={iosSafari} status={status} onClose={() => setDialogOpen(false)} />
    </PwaInstallContext.Provider>
  );
}

function InstallAppDialog({ open, iosDevice, iosSafari, status, onClose }: { open: boolean; iosDevice: boolean; iosSafari: boolean; status: string; onClose: () => void }) {
  if (!open) return null;

  return (
    <div className="installAppOverlay" role="presentation" onClick={onClose}>
      <section className="installAppDialog card" role="dialog" aria-modal="true" aria-labelledby="install-app-dialog-heading" onClick={(event) => event.stopPropagation()}>
        <div>
          <p className="eyebrow">App</p>
          <h2 id="install-app-dialog-heading">Install Clay Performance Lab</h2>
        </div>
        {iosDevice ? (
          <>
            {!iosSafari ? <p className="muted">Open Clay Performance Lab in Safari first, then follow the steps below.</p> : null}
            <ol className="installSteps">
              <li>Open this page in Safari</li>
              <li>Tap the Share button</li>
              <li>Choose “Add to Home Screen”</li>
              <li>Turn on “Open as Web App”</li>
              <li>Tap “Add”</li>
            </ol>
            <p className="muted">Clay Performance Lab will then appear on your Home Screen and open like an app.</p>
          </>
        ) : (
          <p className="muted">Your browser is not offering app installation right now. Keep using Clay Performance Lab here and try Install app from the menu again later.</p>
        )}
        {status ? <p className="small successText" role="status">{status}</p> : null}
        <div className="installAppActions">
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </section>
    </div>
  );
}

export function usePwaInstallPrompt() {
  const value = useContext(PwaInstallContext);
  if (!value) throw new Error("usePwaInstallPrompt must be used inside PwaInstallProvider.");
  return value;
}
