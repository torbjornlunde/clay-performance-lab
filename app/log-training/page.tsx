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

type TrainingVolumeLog = Pick<SimpleTrainingLog, "date" | "targets_fired">;

type TrainingVolumeInsights = {
  trainingTargetsThisYear: number;
  trainingSessionsThisYear: number;
  averageTargetsPerSessionThisYear: number | null;
  trainingTargetsLast30Days: number;
  trainingSessionsLast30Days: number;
  averageDaysBetweenSessions: number | null;
  daysSinceLastTrainingSession: number | null;
  insightMessages: string[];
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

function isoDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysBetweenDates(earlier: string, later: string) {
  const earlierTime = new Date(`${earlier}T00:00:00`).getTime();
  const laterTime = new Date(`${later}T00:00:00`).getTime();
  return Math.round((laterTime - earlierTime) / 86_400_000);
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatMetricNumber(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(Math.round(value));
}

function buildTrainingVolumeInsights(logs: TrainingVolumeLog[], today = new Date()): TrainingVolumeInsights {
  const todayValue = isoDateValue(today);
  const yearStart = `${today.getFullYear()}-01-01`;
  const last30DaysStartDate = new Date(today);
  last30DaysStartDate.setDate(last30DaysStartDate.getDate() - 29);
  const last30DaysStart = isoDateValue(last30DaysStartDate);

  const datedLogs = logs
    .filter((log) => log.date <= todayValue)
    .sort((a, b) => a.date.localeCompare(b.date));
  const thisYearLogs = datedLogs.filter((log) => log.date >= yearStart);
  const last30DaysLogs = datedLogs.filter((log) => log.date >= last30DaysStart);

  const trainingTargetsThisYear = thisYearLogs.reduce((sum, log) => sum + (log.targets_fired || 0), 0);
  const trainingSessionsThisYear = thisYearLogs.length;
  const trainingTargetsLast30Days = last30DaysLogs.reduce((sum, log) => sum + (log.targets_fired || 0), 0);
  const trainingSessionsLast30Days = last30DaysLogs.length;
  const averageTargetsPerSessionThisYear =
    trainingSessionsThisYear > 0 ? trainingTargetsThisYear / trainingSessionsThisYear : null;

  const gaps = datedLogs.slice(1).map((log, index) => daysBetweenDates(datedLogs[index].date, log.date));
  const averageDaysBetweenSessions = average(gaps);
  const lastLog = datedLogs.at(-1);
  const daysSinceLastTrainingSession = lastLog ? Math.max(0, daysBetweenDates(lastLog.date, todayValue)) : null;

  const insightMessages: string[] = [];
  if (datedLogs.length === 0) {
    insightMessages.push("No training volume logged yet. Add a simple training log to start tracking your season.");
  } else if (datedLogs.length === 1) {
    insightMessages.push("You have logged one training session. Add a few more sessions to see training rhythm insights.");
  } else {
    if (daysSinceLastTrainingSession !== null && daysSinceLastTrainingSession >= 14) {
      insightMessages.push(`It has been ${daysSinceLastTrainingSession} days since your last logged training session.`);
    }

    if (averageDaysBetweenSessions !== null) {
      const averageTargetsPerLoggedSession =
        datedLogs.reduce((sum, log) => sum + (log.targets_fired || 0), 0) / datedLogs.length;
      if (trainingSessionsLast30Days >= 4 && averageDaysBetweenSessions <= 10) {
        insightMessages.push("Your training rhythm has been fairly consistent recently, based on your logged training volume.");
      } else if (averageDaysBetweenSessions >= 14 && averageTargetsPerLoggedSession >= 100) {
        insightMessages.push("You may tend to train with higher volume but longer gaps between sessions.");
      } else if (trainingSessionsLast30Days >= 4 && trainingTargetsLast30Days < 300) {
        insightMessages.push("You appear to train regularly, but your total target volume is still modest based on your logged training volume.");
      } else {
        insightMessages.push("Based on your logged training volume, a few more sessions could make your training rhythm clearer.");
      }
    }
  }

  return {
    trainingTargetsThisYear,
    trainingSessionsThisYear,
    averageTargetsPerSessionThisYear,
    trainingTargetsLast30Days,
    trainingSessionsLast30Days,
    averageDaysBetweenSessions,
    daysSinceLastTrainingSession,
    insightMessages: insightMessages.slice(0, 2),
  };
}

function isMinimumSimpleLog(log: SimpleTrainingLog) {
  return log.hits === null && !log.discipline && !log.location && !log.notes;
}

function MetricCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="trainingVolumeMetric">
      <span>{label}</span>
      <strong>{value}</strong>
      {helper && <small>{helper}</small>}
    </div>
  );
}

function TrainingVolumeInsightsCard({
  insights,
  competitionTargetsThisYear,
}: {
  insights: TrainingVolumeInsights;
  competitionTargetsThisYear: number | null;
}) {
  const totalTargetsThisYear =
    competitionTargetsThisYear === null ? null : insights.trainingTargetsThisYear + competitionTargetsThisYear;

  return (
    <section className="card dashboardSectionCard trainingVolumeInsights" aria-labelledby="training-volume-heading">
      <div className="sectionHeader listSectionHeader">
        <div>
          <p className="eyebrow">Training volume insights</p>
          <h2 id="training-volume-heading">Simple training volume</h2>
        </div>
      </div>

      <div className="trainingVolumeMetricGrid">
        <MetricCard label="Training targets this year" value={formatMetricNumber(insights.trainingTargetsThisYear)} />
        <MetricCard label="Training sessions this year" value={formatMetricNumber(insights.trainingSessionsThisYear)} />
        <MetricCard
          label="Average targets per session"
          value={formatMetricNumber(insights.averageTargetsPerSessionThisYear)}
          helper="This calendar year"
        />
        <MetricCard label="Training targets last 30 days" value={formatMetricNumber(insights.trainingTargetsLast30Days)} />
        <MetricCard label="Training sessions last 30 days" value={formatMetricNumber(insights.trainingSessionsLast30Days)} />
        <MetricCard
          label="Average days between sessions"
          value={formatMetricNumber(insights.averageDaysBetweenSessions)}
          helper={insights.averageDaysBetweenSessions === null ? "Add another log to calculate this" : undefined}
        />
        <MetricCard
          label="Days since last training session"
          value={formatMetricNumber(insights.daysSinceLastTrainingSession)}
          helper={insights.daysSinceLastTrainingSession === null ? "No logged sessions yet" : undefined}
        />
        {competitionTargetsThisYear !== null && (
          <MetricCard label="Competition targets this year" value={formatMetricNumber(competitionTargetsThisYear)} />
        )}
        {totalTargetsThisYear !== null && (
          <MetricCard label="Total targets this year" value={formatMetricNumber(totalTargetsThisYear)} />
        )}
      </div>

      <div className="trainingInsightList" aria-label="Training volume insight text">
        {insights.insightMessages.map((message) => (
          <p key={message}>{message}</p>
        ))}
      </div>
    </section>
  );
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
  const [volumeLogs, setVolumeLogs] = useState<TrainingVolumeLog[]>([]);
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

      const today = new Date();
      const yearStart = `${today.getFullYear()}-01-01`;
      const todayValue = isoDateValue(today);
      const [recentLogsResult, volumeLogsResult, competitionsResult] = await Promise.all([
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
          .select("date,targets_fired")
          .eq("source_type", "simple_training")
          .lte("date", todayValue)
          .order("date", { ascending: true })
          .returns<TrainingVolumeLog[]>(),
        supabase
          .from("sessions")
          .select("id,total_targets")
          .eq("session_type", "Competition")
          .gte("competition_date", yearStart)
          .not("total_targets", "is", null)
          .returns<CompetitionTargetRow[]>(),
      ]);

      if (!active) return;

      if (recentLogsResult.error || volumeLogsResult.error) {
        setLoadError("Simple training logs could not be loaded. If this is a new deployment, run the Supabase migration first.");
        setLogs([]);
        setVolumeLogs([]);
        setCompetitionTargetsThisYear(null);
        setLoadingLogs(false);
        return;
      }

      setLogs(recentLogsResult.data || []);
      setVolumeLogs(volumeLogsResult.data || []);
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

  const volumeInsights = useMemo(() => buildTrainingVolumeInsights(volumeLogs), [volumeLogs]);

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

      {loadingLogs ? (
        <section className="card dashboardSectionCard trainingVolumeInsights" aria-labelledby="training-volume-heading">
          <div className="sectionHeader listSectionHeader">
            <div>
              <p className="eyebrow">Training volume insights</p>
              <h2 id="training-volume-heading">Simple training volume</h2>
            </div>
          </div>
          <p>Loading...</p>
        </section>
      ) : loadError ? (
        <section className="card dashboardSectionCard trainingVolumeInsights" aria-labelledby="training-volume-heading">
          <div className="sectionHeader listSectionHeader">
            <div>
              <p className="eyebrow">Training volume insights</p>
              <h2 id="training-volume-heading">Simple training volume</h2>
            </div>
          </div>
          <div className="error">{loadError}</div>
        </section>
      ) : (
        <TrainingVolumeInsightsCard insights={volumeInsights} competitionTargetsThisYear={competitionTargetsThisYear} />
      )}

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
