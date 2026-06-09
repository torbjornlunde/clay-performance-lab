"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

const trainingActions = [
  {
    href: "/simple-training-logs/new",
    title: "Simple training log",
    description: "Log only date and targets fired. You can add more details later.",
  },
  {
    href: "/training-score-sheets/new",
    title: "Training score sheets",
    description: "Score one or more shooters during training.",
  },
  {
    href: "/sessions/new?type=training",
    title: "Personal training log",
    description: "Log your own detailed training session.",
  },
  {
    href: "/training-score-sheets",
    title: "Existing training score sheets",
    description: "Open saved, draft, or unsynced score sheets.",
  },
];

type SimpleTrainingLog = {
  id: string;
  date: string;
  targets_fired: number;
  hits: number | null;
  discipline: string | null;
  location: string | null;
  notes: string | null;
  source_type: string;
  created_at: string;
};

type CompetitionTargetRow = {
  id: string;
  total_targets: number | null;
};

function formatTrainingDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function hitPercentage(log: SimpleTrainingLog) {
  if (log.hits === null || log.targets_fired <= 0) return null;
  return (log.hits / log.targets_fired) * 100;
}

function isMinimumSimpleLog(log: SimpleTrainingLog) {
  return log.hits === null && !log.discipline && !log.location && !log.notes;
}

function SimpleTrainingLogCard({ log }: { log: SimpleTrainingLog }) {
  const percentage = hitPercentage(log);
  const isMinimumLog = isMinimumSimpleLog(log);

  return (
    <article className="sessionItem dashboardListItem">
      <div className="sessionContent">
        <div className="sessionTopline compactTopline">
          <strong>Simple training log</strong>
          <span className="badge badgeGreen">Training</span>
        </div>
        <div className="small muted sessionMeta compactMeta">
          <span>{formatTrainingDate(log.date)}</span>
          <span>{log.targets_fired} targets</span>
          {log.hits !== null && <span>{log.hits} hits</span>}
          {percentage !== null && <span>{percentage.toFixed(0)}%</span>}
          {log.discipline && <span>{log.discipline}</span>}
          {log.location && <span>{log.location}</span>}
        </div>
        {log.notes && <p className="small muted simpleTrainingNotes">{log.notes}</p>}
        {isMinimumLog && (
          <p className="small muted simpleTrainingNotes">
            Add hits, discipline or notes when you are ready.
          </p>
        )}
      </div>
      <div className="sessionActions simpleTrainingListActions">
        <Link href={`/simple-training-logs/${log.id}/edit`} className="button secondary smallButton">
          {isMinimumLog ? "Add more details" : "Edit"}
        </Link>
      </div>
    </article>
  );
}

export default function LogTrainingPage() {
  const [logs, setLogs] = useState<SimpleTrainingLog[]>([]);
  const [trainingTargetsThisYear, setTrainingTargetsThisYear] = useState(0);
  const [competitionTargetsThisYear, setCompetitionTargetsThisYear] = useState<number | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("simpleLogSaved") === "1") setStatusMessage("Training log saved.");
    else if (searchParams.get("simpleLogUpdated") === "1") setStatusMessage("Training log updated.");
    else if (searchParams.get("simpleLogDeleted") === "1") setStatusMessage("Training log deleted.");
    else setStatusMessage("");

    let active = true;

    async function loadSimpleLogs() {
      setLoadingLogs(true);
      setLoadError("");

      const yearStart = `${new Date().getFullYear()}-01-01`;
      const [recentLogsResult, yearlyLogsResult, competitionsResult] = await Promise.all([
        supabase
          .from("training_logs")
          .select("id,date,targets_fired,hits,discipline,location,notes,source_type,created_at")
          .eq("source_type", "simple_training")
          .order("date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(5)
          .returns<SimpleTrainingLog[]>(),
        supabase
          .from("training_logs")
          .select("targets_fired")
          .eq("source_type", "simple_training")
          .gte("date", yearStart)
          .returns<Pick<SimpleTrainingLog, "targets_fired">[]>(),
        supabase
          .from("sessions")
          .select("id,total_targets")
          .eq("session_type", "Competition")
          .gte("competition_date", yearStart)
          .not("total_targets", "is", null)
          .returns<CompetitionTargetRow[]>(),
      ]);

      if (!active) return;

      if (recentLogsResult.error || yearlyLogsResult.error) {
        setLoadError("Simple training logs could not be loaded. If this is a new deployment, run the Supabase migration first.");
        setLogs([]);
        setTrainingTargetsThisYear(0);
        setCompetitionTargetsThisYear(null);
        setLoadingLogs(false);
        return;
      }

      setLogs(recentLogsResult.data || []);
      setTrainingTargetsThisYear((yearlyLogsResult.data || []).reduce((sum, log) => sum + (log.targets_fired || 0), 0));
      setCompetitionTargetsThisYear(
        competitionsResult.error ? null : (competitionsResult.data || []).reduce((sum, row) => sum + (row.total_targets || 0), 0),
      );
      setLoadingLogs(false);
    }

    loadSimpleLogs();

    return () => {
      active = false;
    };
  }, []);

  const totalTargetsThisYear = useMemo(() => {
    if (competitionTargetsThisYear === null) return null;
    return trainingTargetsThisYear + competitionTargetsThisYear;
  }, [competitionTargetsThisYear, trainingTargetsThisYear]);

  return (
    <main className="container narrow">
      <div className="card productNavPage">
        <div className="heroTopline">
          <div>
            <p className="eyebrow">Log training</p>
            <h1>Choose how to record training</h1>
            <p className="muted">Create a score sheet, log personal practice, or return to existing work.</p>
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

      <section className="card dashboardSectionCard" aria-labelledby="training-volume-heading">
        <div className="sectionHeader listSectionHeader">
          <div>
            <p className="eyebrow">Season volume</p>
            <h2 id="training-volume-heading">This year</h2>
          </div>
        </div>
        <div className="compactSummaryGrid">
          <div className="summaryStat">
            <span>Training targets this year</span>
            <strong>{trainingTargetsThisYear}</strong>
          </div>
          {competitionTargetsThisYear !== null && (
            <div className="summaryStat">
              <span>Competition targets this year</span>
              <strong>{competitionTargetsThisYear}</strong>
            </div>
          )}
          {totalTargetsThisYear !== null && (
            <div className="summaryStat">
              <span>Total targets this year</span>
              <strong>{totalTargetsThisYear}</strong>
            </div>
          )}
        </div>
      </section>

      <section className="card dashboardSectionCard" aria-labelledby="simple-training-heading">
        <div className="sectionHeader listSectionHeader">
          <div>
            <p className="eyebrow">Saved simple logs</p>
            <h2 id="simple-training-heading">Simple training logs</h2>
          </div>
          <Link href="/simple-training-logs/new" className="button smallButton">Add simple log</Link>
        </div>
        {loadingLogs ? (
          <p>Loading...</p>
        ) : loadError ? (
          <div className="error">{loadError}</div>
        ) : logs.length === 0 ? (
          <div className="emptyState compactEmptyState">
            <p>No simple training logs yet. Save a minimum entry with only date and targets fired.</p>
            <div className="btns compactEmptyActions">
              <Link href="/simple-training-logs/new" className="button smallButton">Add simple log</Link>
            </div>
          </div>
        ) : (
          logs.map((log) => <SimpleTrainingLogCard key={log.id} log={log} />)
        )}
      </section>
    </main>
  );
}
