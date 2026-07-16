"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { betaFeedbackHref } from "@/lib/betaFeedback";

const checklistItems = [
  "Sign in and confirm access works",
  "Check that the Dashboard feels understandable",
  "Open Performance and check if the information makes sense",
  "Create a simple training log",
  "Create or open a Training Score Sheet if available",
  "Try the app on mobile during realistic use",
  "Report bugs, confusing wording, layout issues or slow screens",
];

export default function BetaChecklistPage() {
  const [feedbackHref, setFeedbackHref] = useState("");

  useEffect(() => {
    setFeedbackHref(betaFeedbackHref("Beta test checklist"));
  }, []);

  return (
    <main>
      <section className="heroCard betaChecklistHero" aria-labelledby="beta-checklist-heading">
        <div>
          <p className="eyebrow">Closed beta</p>
          <h2 id="beta-checklist-heading">Beta test checklist</h2>
          <p>
            Use this short checklist during testing. It is meant to help you try the important flows before
            the NM field test, especially on mobile and during realistic shooting use.
          </p>
        </div>
        <div className="heroActions stackedOnMobile">
          {feedbackHref && <Link className="button" href={feedbackHref}>Send feedback</Link>}
          <Link href="/dashboard" className="button secondary">Back to Dashboard</Link>
        </div>
      </section>

      <section className="card betaChecklistCard" aria-label="What to test">
        <ol className="betaChecklistList">
          {checklistItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </section>
    </main>
  );
}
