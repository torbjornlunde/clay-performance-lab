"use client";

import { useEffect, useState } from "react";
import { recordAnalyticsEvent } from "@/lib/analytics";
import { supabase } from "@/lib/supabase/client";

export const ONBOARDING_DISMISSED_KEY = "clay-performance-lab:onboarding:dismissed:v1";
const HELP_EVENT = "clay-performance-lab:onboarding:open";

function safeGet(key: string) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch {}
}

async function recordHelpEvent(eventName: "onboarding_opened" | "onboarding_dismissed" | "contextual_help_dismissed", feature: string) {
  await recordAnalyticsEvent(supabase, eventName, { feature, metadata: { feature } });
}

export function OnboardingHelpPanel() {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    let authenticated = false;

    async function initialize() {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      authenticated = Boolean(data.user);
      const dismissed = safeGet(ONBOARDING_DISMISSED_KEY) === "true";
      setOpen(authenticated && !dismissed);
      setReady(true);
    }

    const reopen = () => {
      if (!authenticated) return;
      setOpen(true);
      recordHelpEvent("onboarding_opened", "getting_started");
    };

    initialize();
    window.addEventListener(HELP_EVENT, reopen);
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      authenticated = Boolean(session?.user);
      if (!authenticated) setOpen(false);
      if (authenticated && safeGet(ONBOARDING_DISMISSED_KEY) !== "true") setOpen(true);
      setReady(true);
    });
    return () => {
      active = false;
      window.removeEventListener(HELP_EVENT, reopen);
      listener.subscription.unsubscribe();
    };
  }, []);

  if (!ready || !open) return null;

  function dismiss(action: "get_started" | "dismiss" | "open_help_later") {
    safeSet(ONBOARDING_DISMISSED_KEY, "true");
    setOpen(false);
    recordHelpEvent("onboarding_dismissed", action);
  }

  return (
    <section className="card onboardingHelpPanel" aria-labelledby="getting-started-heading">
      <p className="eyebrow">Getting started</p>
      <h2 id="getting-started-heading">Start with the workflow you need today</h2>
      <ul className="helpList">
        <li>Import competition results from Leirdue.net.</li>
        <li>Add a result manually when you only need the basics.</li>
        <li>Use scorecard/photo import to review scores from a card.</li>
        <li>Use Training Score Sheet when one person scores several shooters.</li>
        <li>Review misses and analysis later from each saved session.</li>
      </ul>
      <div className="btns onboardingActions">
        <button type="button" onClick={() => dismiss("get_started")}>Get started</button>
        <button type="button" className="secondary" onClick={() => dismiss("dismiss")}>Dismiss</button>
        <button type="button" className="secondary" onClick={() => dismiss("open_help_later")}>Open help later</button>
      </div>
      <p className="small muted">You can reopen this from Menu → Help / Getting started.</p>
    </section>
  );
}

export function openOnboardingHelp() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(HELP_EVENT));
}

export function ContextualHelpCard({ storageKey, children }: { storageKey: string; children: React.ReactNode }) {
  const fullKey = `clay-performance-lab:contextual-help:${storageKey}:dismissed:v1`;
  const [visible, setVisible] = useState(false);
  useEffect(() => { setVisible(safeGet(fullKey) !== "true"); }, [fullKey]);
  if (!visible) return null;
  return (
    <aside className="contextualHelpCard" aria-label="Page help">
      <p>{children}</p>
      <button
        type="button"
        className="secondary smallButton"
        onClick={() => {
          safeSet(fullKey, "true");
          setVisible(false);
          recordHelpEvent("contextual_help_dismissed", storageKey);
        }}
      >
        Dismiss
      </button>
    </aside>
  );
}
