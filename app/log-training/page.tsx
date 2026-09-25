"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const trainingActions = [
  {
    href: "/simple-training-logs/new",
    title: "Add simple training log",
    description: "Fast volume log: date and targets fired, with optional hits and notes.",
  },
  {
    href: "/training-score-sheets/new",
    title: "Training Score Sheet",
    description: "Field-mode scoring for one or more shooters during training.",
  },
];

export default function LogTrainingPage() {
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("simpleLogSaved") === "1") setStatusMessage("Training log saved. View it under Dashboard and Performance.");
    else if (searchParams.get("simpleLogUpdated") === "1") setStatusMessage("Training log updated.");
    else if (searchParams.get("simpleLogDeleted") === "1") setStatusMessage("Training log deleted.");
    else setStatusMessage("");
  }, []);

  return (
    <main className="container narrow">
      <div className="card productNavPage">
        <div className="heroTopline">
          <div>
            <p className="eyebrow">Log training</p>
            <h1>Log training</h1>
            <p className="muted">Pick up where you left off, or start a new log.</p>
          </div>
          <div className="btns heroActions">
            <Link href="/dashboard" className="button secondary smallButton">Dashboard</Link>
          </div>
        </div>

        {statusMessage && <div className="success">{statusMessage}</div>}

        <Link href="/training-score-sheets?view=drafts" className="dashboardActionCard productActionCard primaryAction">
          <span>Continue a score sheet</span>
          <small>Open drafts and incomplete training score sheets.</small>
        </Link>

        <div className="productActionGrid" aria-label="Training logging options">
          {trainingActions.map((action) => (
            <Link key={action.href} href={action.href} className="dashboardActionCard productActionCard secondaryAction">
              <span>{action.title}</span>
              <small>{action.description}</small>
            </Link>
          ))}
        </div>
        <details className="detailAccordion">
          <summary><span>More training options</span></summary>
          <div className="detailAccordionBody">
            <p className="small muted">Need target-by-target misses, reasons and course details?</p>
            <Link href="/sessions/new?type=training" className="button secondary smallButton">Detailed personal log</Link>
            <p className="small"><Link href="/training-score-sheets">View all training score sheets</Link></p>
          </div>
        </details>
      </div>
    </main>
  );
}
