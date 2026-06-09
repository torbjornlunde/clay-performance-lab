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
  {
    href: "/sessions/new?type=training",
    title: "Detailed personal training log",
    description: "Use when you want misses, targets, reasons, and course details.",
  },
  {
    href: "/training-score-sheets",
    title: "Continue Training Score Sheet",
    description: "Open saved, draft, or unsynced score sheets.",
  },
];

export default function LogTrainingPage() {
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("simpleLogSaved") === "1") setStatusMessage("Training log saved. View it under Performance.");
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
            <h1>Choose how to record training</h1>
            <p className="muted">Start a simple log, score a training session, or continue a saved score sheet.</p>
          </div>
          <div className="btns heroActions">
            <Link href="/dashboard" className="button secondary smallButton">Dashboard</Link>
          </div>
        </div>

        {statusMessage && <div className="success">{statusMessage}</div>}

        <div className="productActionGrid" aria-label="Training logging options">
          {trainingActions.map((action) => (
            <Link key={action.href} href={action.href} className="dashboardActionCard productActionCard secondaryAction">
              <span>{action.title}</span>
              <small>{action.description}</small>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
