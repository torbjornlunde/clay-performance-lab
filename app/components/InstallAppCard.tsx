"use client";

import { useEffect, useState } from "react";
import { usePwaInstallPrompt } from "@/app/components/PwaInstallProvider";

const DISMISSED_KEY = "cpl-install-hint-dismissed";

export default function InstallAppCard() {
  const { promptEvent, iosDevice, standalone, openInstallExperience } = usePwaInstallPrompt();
  const [hintDismissed, setHintDismissed] = useState(true);

  useEffect(() => {
    setHintDismissed(localStorage.getItem(DISMISSED_KEY) === "1");
  }, []);

  if (standalone) {
    return (
      <section className="card installAppCard" aria-labelledby="install-app-heading">
        <div>
          <p className="eyebrow">App</p>
          <h3 id="install-app-heading">Install Clay Performance Lab</h3>
          <p className="muted">Clay Performance Lab is installed on this device.</p>
        </div>
      </section>
    );
  }

  if (hintDismissed && !promptEvent && !iosDevice) return null;

  function dismissHint() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setHintDismissed(true);
  }

  return (
    <section className="card installAppCard" aria-labelledby="install-app-heading">
      <div>
        <p className="eyebrow">App</p>
        <h3 id="install-app-heading">Install Clay Performance Lab</h3>
        <p className="muted">Add Clay Performance Lab to your Home Screen for a faster app-like launch.</p>
      </div>
      <div className="installAppActions">
        <button type="button" onClick={() => void openInstallExperience()}>{iosDevice && !promptEvent ? "Show installation steps" : "Install app"}</button>
        {!hintDismissed ? <button type="button" className="secondary" onClick={dismissHint}>Hide this hint</button> : null}
      </div>
    </section>
  );
}
