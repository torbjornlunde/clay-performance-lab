"use client";

import { useEffect, useState } from "react";
import { useStandaloneMode } from "@/lib/pwa/useStandaloneMode";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISSED_KEY = "cpl-install-hint-dismissed";

function isAppleMobile() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export default function InstallAppCard() {
  const standalone = useStandaloneMode();
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [appleMobile, setAppleMobile] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setAppleMobile(isAppleMobile());
    setDismissed(localStorage.getItem(DISMISSED_KEY) === "1");
    function capturePrompt(event: Event) {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
      setDismissed(false);
    }
    window.addEventListener("beforeinstallprompt", capturePrompt);
    return () => window.removeEventListener("beforeinstallprompt", capturePrompt);
  }, []);

  if (standalone || dismissed || (!promptEvent && !appleMobile)) return null;

  async function install() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "accepted") setPromptEvent(null);
    setStatus(choice.outcome === "accepted" ? "Install started." : "Install was dismissed.");
  }

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  }

  return (
    <section className="card installAppCard" aria-labelledby="install-app-heading">
      <div>
        <h3 id="install-app-heading">Install app</h3>
        <p className="muted">Add Clay Performance Lab to your home screen for a standalone app-like launch.</p>
        {appleMobile && !promptEvent ? <p className="small muted">Open the Share menu in Safari and choose Add to Home Screen.</p> : null}
        {status ? <p className="small successText" role="status">{status}</p> : null}
      </div>
      <div className="installAppActions">
        {promptEvent ? <button type="button" onClick={install}>Install app</button> : null}
        <button type="button" className="secondary" onClick={dismiss}>Not now</button>
      </div>
    </section>
  );
}
