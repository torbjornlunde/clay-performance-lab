"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
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

async function recordHelpEvent(eventName: "onboarding_opened" | "onboarding_dismissed" | "contextual_help_dismissed", feature: string, action?: string) {
  await recordAnalyticsEvent(supabase, eventName, { feature, metadata: { feature, action } });
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

  function dismiss(action: "get_started" | "remind_me_later" | "dismiss") {
    if (action !== "remind_me_later") safeSet(ONBOARDING_DISMISSED_KEY, "true");
    setOpen(false);
    recordHelpEvent("onboarding_dismissed", "getting_started", action);
  }

  return (
    <section className="card onboardingHelpPanel" aria-labelledby="getting-started-heading">
      <p className="eyebrow">Getting started</p>
      <h2 id="getting-started-heading">Save something useful today</h2>
      <ol className="helpList">
        <li><Link href="/profile" onClick={() => dismiss("get_started")}>Check your profile and disciplines.</Link></li>
        <li><Link href="/log-competition" onClick={() => dismiss("get_started")}>Add your first competition</Link> or <Link href="/import" onClick={() => dismiss("get_started")}>choose an import service</Link>. A score is enough to start.</li>
        <li><Link href="/stats" onClick={() => dismiss("get_started")}>Review Performance</Link> as you build your history. More results make trends more useful.</li>
      </ol>
      <details>
        <summary>Explore when you need more</summary>
        <ul className="helpList">
          <li><strong>Scorecards:</strong> open a saved competition to import a photo and review its scores. Target setup is optional.</li>
          <li><Link href="/log-training" onClick={() => dismiss("get_started")}>Training:</Link> save a simple training log or use Training Score Sheet for several shooters.</li>
          <li><strong>Target details:</strong> add posts, targets and misses later from your saved competition.</li>
          <li><Link href="/coach-report" onClick={() => dismiss("get_started")}>Coach Report:</Link> bring scores and optional notes together for a discussion with your coach. Missing detail stays uncertain.</li>
          <li><Link href="/notifications" onClick={() => dismiss("get_started")}>Notifications:</Link> review updates in the app. You can also install CPL from your browser for easier access.</li>
        </ul>
      </details>
      <details>
        <summary>Short feature guides</summary>
        <p className="small muted">Open How this works on the relevant page at any time.</p>
        <ul className="helpList">
          <li><Link href="/import/leirdue" onClick={() => dismiss("get_started")}>Find and review Leirdue.net results</Link></li>
          <li><Link href="/results" onClick={() => dismiss("get_started")}>Scorecard photos:</Link> open a competition, choose scorecard import, then How this works.</li>
          <li><Link href="/training-score-sheets" onClick={() => dismiss("get_started")}>Training Score Sheet</Link></li>
        </ul>
      </details>
      <div className="btns onboardingActions">
        <button type="button" onClick={() => dismiss("get_started")}>Get started</button>
        <button type="button" className="secondary" onClick={() => dismiss("remind_me_later")}>Remind me later</button>
        <button type="button" className="secondary" onClick={() => dismiss("dismiss")}>Dismiss tips</button>
      </div>
      <p className="small muted">You can reopen this from Menu → Help / Getting started.</p>
    </section>
  );
}

export function openOnboardingHelp() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(HELP_EVENT));
}

const TUTORIAL_STEPS: Record<string, readonly string[]> = {
  "leirdue-import": [
    "Search with your shooter name and year, or paste a result link.",
    "Check the event, shooter name, score and target total. Review uncertain matches yourself.",
    "Import only your chosen results. Use Continue search if more results remain.",
  ],
  "scorecard-photo-import": [
    "Upload a clear photo showing the whole scorecard. Crop to the relevant card if needed.",
    "Check the detected posts, scores and target counts against the photo. Correct anything uncertain.",
    "Apply only after review. Add target details later if they will be useful.",
  ],
  "training-score-sheet": [
    "Choose the discipline, posts and target counts, then add the shooters.",
    "Record scores for each shooter as training progresses. Check the totals before finishing.",
    "Save the sheet and reopen it from Training Score Sheets when needed.",
  ],
};

export function ContextualHelpCard({ storageKey, children }: { storageKey: string; children: React.ReactNode }) {
  const fullKey = `clay-performance-lab:contextual-help:${storageKey}:dismissed:v1`;
  const panelId = useId();
  const [visible, setVisible] = useState(false);
  useEffect(() => { setVisible(safeGet(fullKey) !== "true"); }, [fullKey]);
  const steps = TUTORIAL_STEPS[storageKey];
  function dismiss() {
    safeSet(fullKey, "true");
    setVisible(false);
    recordHelpEvent("contextual_help_dismissed", storageKey);
  }
  return (
    <div className="contextualHelp">
      <button type="button" className="secondary smallButton" aria-expanded={visible} aria-controls={panelId} onClick={() => {
        if (visible) dismiss(); else setVisible(true);
      }}>How this works</button>
      {visible ? <aside id={panelId} className="contextualHelpCard" aria-label="Page help">
        <div className="contextualHelpContent">
          <p>{children}</p>
          {steps ? <ol className="helpList">{steps.map((step) => <li key={step}>{step}</li>)}</ol> : null}
        </div>
        <div className="btns contextualHelpActions">
          <button type="button" className="secondary smallButton" onClick={dismiss}>Got it</button>
          <button type="button" className="secondary smallButton" onClick={dismiss}>Skip</button>
        </div>
      </aside> : null}
    </div>
  );
}
