"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { calculateRollingAverage, calculateRollingStdDev, DEFAULT_ROLLING_WINDOW_SIZE } from "@/lib/analysis/stats";
import { buildCompetitionActivitySummary } from "@/lib/competitionActivity";
import { countMissesBySession, scoreFromMisses } from "@/lib/misses/scoring";
import { calculatePerformanceSummary, calculateWinnerContext, filterPerformanceResults, type PerformanceDataType, type PerformancePeriod, type PerformanceResult } from "@/lib/performance/summary";
import { normalizeShootingGroundName, type UserShootingGround } from "@/lib/shootingGrounds/aliases";
import { supabase } from "@/lib/supabase/client";

type SessionRow = {
  id: string;
  name: string;
  discipline: string;
  session_type: string;
  shooting_format: string | null;
  course_count: number | null;
  total_targets?: number | null;
  created_at: string;
  competition_date?: string | null;
  leirdue_result_url?: string | null;
  own_score?: number | null;
  winning_score?: number | null;
  calculated_score?: number | null;
  shooting_ground?: string | null;
  user_shooting_ground_id?: string | null;
  user_shooting_grounds?: { display_name: string | null } | null;
};

type MissRow = { session_id: string; missed_target: string | null };

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

type PerformanceTrainingLog = Pick<SimpleTrainingLog, "id" | "date" | "targets_fired" | "hits" | "discipline" | "source_type">;

type TrainingScoreSheetLog = {
  id: string;
  title: string;
  session_date: string;
  location: string | null;
  discipline: string;
  session_type: string;
  number_of_posts: number;
  targets_per_post: number;
  total_targets: number;
  created_at: string;
};

type TrainingHistoryItem =
  | { kind: "practice_log"; id: string; date: string; createdAt: string; log: SimpleTrainingLog }
  | { kind: "training_score_sheet"; id: string; date: string; createdAt: string; sheet: TrainingScoreSheetLog };

type TrainingVolumeLog = {
  date: string;
  targets_fired: number;
  hits: number | null;
  kind: "practice_log" | "training_score_sheet";
};

type TrainingVolumeInsights = {
  trainingTargetsThisYear: number;
  trainingSessionsThisYear: number;
  averageTargetsPerSessionThisYear: number | null;
  trainingTargetsLast30Days: number;
  trainingSessionsLast30Days: number;
  averageDaysBetweenSessions: number | null;
  daysSinceLastTrainingSession: number | null;
  practiceLogsWithHits: number;
  averagePracticeHitPercentage: number | null;
  insightMessages: string[];
};

type GroundSummary = {
  key: string;
  name: string;
  canonicalGroundId: string | null;
  sourceNames: string[];
  count: number;
  average: number;
  best: number;
  latest: number;
  latestDate: string;
  sessions: Array<{ session: SessionRow; score: number; percentage: number }>;
};

type ChartPoint = {
  id: string;
  name: string;
  date: string;
  percentage: number;
  rollingAveragePercentage: number;
  score: number;
  winningScore: number;
  discipline: string;
  leirdueResultUrl: string | null;
  shootingGround: string | null;
  x: number;
  y: number;
  rollingAverageY: number;
};

function isUsableNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

function formatTrainingDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
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

function formatMetricPercentage(value: number | null) {
  if (value === null) return "—";
  return `${value.toFixed(0)}%`;
}

function formatSignedPercentagePoints(value: number | null) {
  if (value === null) return "Not enough previous-period data yet";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)} percentage points vs previous period`;
}

function formatGap(value: number | null) {
  if (value === null) return "—";
  return `${value.toFixed(1)} target${Math.abs(value - 1) < 0.05 ? "" : "s"}`;
}

function hitPercentage(log: SimpleTrainingLog) {
  if (log.hits === null || log.targets_fired <= 0) return null;
  return (log.hits / log.targets_fired) * 100;
}

function isMinimumSimpleLog(log: SimpleTrainingLog) {
  return log.hits === null && !log.discipline && !log.location && !log.notes;
}

function sortTrainingHistoryItems(a: TrainingHistoryItem, b: TrainingHistoryItem) {
  const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
  if (dateDiff !== 0) return dateDiff;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function scoreSheetToVolumeLog(sheet: TrainingScoreSheetLog): TrainingVolumeLog {
  return {
    date: sheet.session_date,
    targets_fired: sheet.total_targets,
    hits: null,
    kind: "training_score_sheet",
  };
}

function simpleLogToVolumeLog(log: SimpleTrainingLog): TrainingVolumeLog {
  return {
    date: log.date,
    targets_fired: log.targets_fired,
    hits: log.hits,
    kind: "practice_log",
  };
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
    insightMessages.push("No training volume logged yet. Add a practice log or training score sheet to start tracking your season.");
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

  const logsWithHits = datedLogs.filter((log) => log.hits !== null && log.targets_fired > 0);
  const averagePracticeHitPercentage = logsWithHits.length > 0
    ? logsWithHits.reduce((sum, log) => sum + ((log.hits || 0) / log.targets_fired) * 100, 0) / logsWithHits.length
    : null;

  return {
    trainingTargetsThisYear,
    trainingSessionsThisYear,
    averageTargetsPerSessionThisYear,
    trainingTargetsLast30Days,
    trainingSessionsLast30Days,
    averageDaysBetweenSessions,
    daysSinceLastTrainingSession,
    practiceLogsWithHits: logsWithHits.length,
    averagePracticeHitPercentage,
    insightMessages: insightMessages.slice(0, 2),
  };
}

function sortableDate(session: SessionRow) {
  return new Date(session.competition_date || session.created_at).getTime();
}

function sortOldestFirst(a: { session: SessionRow }, b: { session: SessionRow }) {
  return sortableDate(a.session) - sortableDate(b.session);
}

function sortNewestChartPoints(a: ChartPoint, b: ChartPoint) {
  return new Date(b.date).getTime() - new Date(a.date).getTime();
}

function formatFullDate(value: string | null | undefined) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function groundKeyForSession(session: SessionRow) {
  const canonicalId = session.user_shooting_ground_id?.trim();
  if (canonicalId) return `ground:${canonicalId}`;
  const normalized = normalizeShootingGroundName(session.shooting_ground || "");
  return normalized ? `source:${normalized}` : "unknown";
}

function displayGroundForSession(session: SessionRow) {
  return session.user_shooting_grounds?.display_name?.trim() || session.shooting_ground?.trim() || "Unknown shooting ground";
}

function formatConsistency(value: number | null) {
  return value === null ? "Not enough data yet" : `± ${value.toFixed(1)} pp`;
}

function chartBounds(percentages: number[]) {
  const highest = Math.max(...percentages);
  const lowest = Math.min(...percentages);
  const maxPercentage = Math.max(100, Math.ceil(highest / 5) * 5);
  const minPercentage = lowest < 50 ? Math.min(50, Math.floor(lowest / 5) * 5 - 5) : 50;
  return { minPercentage, maxPercentage, range: Math.max(maxPercentage - minPercentage, 1) };
}

function scoreUsed(session: SessionRow, missCounts: Record<string, number>) {
  if (isUsableNumber(session.own_score)) return session.own_score;
  if (isUsableNumber(session.calculated_score)) return session.calculated_score;
  if (isUsableNumber(session.total_targets)) return scoreFromMisses(session.total_targets, missCounts[session.id] || 0);
  return null;
}

function percentageFor(session: SessionRow, missCounts: Record<string, number>) {
  const score = scoreUsed(session, missCounts);
  if (!isUsableNumber(score) || !isUsableNumber(session.winning_score) || session.winning_score <= 0) return null;
  return { score, percentage: (score / session.winning_score) * 100 };
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

function CompetitionActivityCard({
  summary,
  selectedYear,
  onSelectedYearChange,
  loading,
}: {
  summary: ReturnType<typeof buildCompetitionActivitySummary>;
  selectedYear: number;
  onSelectedYearChange: (year: number) => void;
  loading: boolean;
}) {
  const historyYears = summary.years.includes(selectedYear) ? summary.years : [selectedYear, ...summary.years];

  return (
    <section className="card statsCompetitionActivityCard" aria-labelledby="competition-activity-heading">
      <div className="sectionHeader listSectionHeader">
        <div>
          <p className="eyebrow">Competition only</p>
          <h2 id="competition-activity-heading">Competition activity</h2>
        </div>
        <label className="competitionYearSelector">
          <span>Year</span>
          <select
            value={selectedYear}
            onChange={(event) => onSelectedYearChange(Number(event.target.value))}
            disabled={loading || historyYears.length === 0}
            aria-label="Competition activity year"
          >
            {historyYears.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : summary.allTimeCompetitionCount === 0 ? (
        <div className="emptyState compactEmptyState">
          <p>No saved competitions yet. Log a competition result or import one from Leirdue.net to see your activity here.</p>
          <div className="btns compactEmptyActions">
            <Link href="/log-competition" className="button smallButton">Log competition</Link>
            <Link href="/import/leirdue" className="button secondary smallButton">Import from Leirdue.net</Link>
          </div>
        </div>
      ) : (
        <>
          <div className="competitionActivityGrid">
            <MetricCard label="All-time competitions" value={formatMetricNumber(summary.allTimeCompetitionCount)} />
            <MetricCard
              label="All-time competition targets"
              value={formatMetricNumber(summary.allTimeCompetitionTargetCount)}
              helper={summary.hasUnknownAllTimeTargets ? "Known targets only; some competitions have no target count" : undefined}
            />
            <MetricCard label={`${selectedYear} competitions`} value={formatMetricNumber(summary.selectedYearCompetitionCount)} />
            <MetricCard
              label={`${selectedYear} competition targets`}
              value={formatMetricNumber(summary.selectedYearCompetitionTargetCount)}
              helper={summary.hasUnknownSelectedYearTargets ? "Known targets only; some competitions have no target count" : undefined}
            />
          </div>
          {summary.selectedYearCompetitionCount === 0 && (
            <p className="small muted competitionActivityNote">No saved competitions in {selectedYear}. Choose another year from your competition history to review activity.</p>
          )}
        </>
      )}
    </section>
  );
}

function TrainingVolumeInsightsCard({
  insights,
  competitionTargetsThisYear,
  loading,
  error,
}: {
  insights: TrainingVolumeInsights;
  competitionTargetsThisYear: number | null;
  loading: boolean;
  error: string;
}) {
  const totalTargetsThisYear =
    competitionTargetsThisYear === null ? null : insights.trainingTargetsThisYear + competitionTargetsThisYear;

  return (
    <section className="card statsTrainingVolumeCard trainingVolumeInsights" aria-labelledby="training-volume-heading">
      <div className="sectionHeader listSectionHeader">
        <div>
          <p className="eyebrow">Training volume</p>
          <h2 id="training-volume-heading">Training volume insights</h2>
        </div>
        <Link href="/log-training" className="button secondary smallButton">Log training</Link>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : error ? (
        <div className="error">{error}</div>
      ) : (
        <>
          <div className="trainingVolumeMetricGrid compactTrainingVolumeGrid">
            <MetricCard label="Training targets this year" value={formatMetricNumber(insights.trainingTargetsThisYear)} />
            <MetricCard label="Training sessions/logs this year" value={formatMetricNumber(insights.trainingSessionsThisYear)} />
            <MetricCard
              label="Average targets per session"
              value={formatMetricNumber(insights.averageTargetsPerSessionThisYear)}
              helper="This calendar year"
            />
            <MetricCard label="Training targets last 30 days" value={formatMetricNumber(insights.trainingTargetsLast30Days)} />
            <MetricCard label="Training sessions/logs last 30 days" value={formatMetricNumber(insights.trainingSessionsLast30Days)} />
            <MetricCard
              label="Average days between sessions"
              value={formatMetricNumber(insights.averageDaysBetweenSessions)}
              helper={insights.averageDaysBetweenSessions === null ? "Add another log to calculate this" : undefined}
            />
            <MetricCard
              label="Days since last training"
              value={formatMetricNumber(insights.daysSinceLastTrainingSession)}
              helper={insights.daysSinceLastTrainingSession === null ? "No logged sessions yet" : undefined}
            />
            <MetricCard
              label="Average practice hit rate"
              value={formatMetricPercentage(insights.averagePracticeHitPercentage)}
              helper={insights.practiceLogsWithHits === 0 ? "Add hits to practice logs to calculate this" : `${insights.practiceLogsWithHits} practice log${insights.practiceLogsWithHits === 1 ? "" : "s"} with hits`}
            />
            {competitionTargetsThisYear !== null && (
              <MetricCard label="Competition targets this year" value={formatMetricNumber(competitionTargetsThisYear)} />
            )}
            {totalTargetsThisYear !== null && (
              <MetricCard label="Training + competition targets this year" value={formatMetricNumber(totalTargetsThisYear)} />
            )}
          </div>

          <div className="trainingInsightList" aria-label="Training volume insight text">
            {insights.insightMessages.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function TrainingHistoryCard({
  logs,
  loading,
  error,
}: {
  logs: TrainingHistoryItem[];
  loading: boolean;
  error: string;
}) {
  return (
    <section className="card statsTrainingHistoryCard" aria-labelledby="training-history-heading">
      <div className="sectionHeader listSectionHeader">
        <div>
          <p className="eyebrow">Training history</p>
          <h2 id="training-history-heading">Recent training logs</h2>
        </div>
        <Link href="/simple-training-logs/new" className="button smallButton">Add training log</Link>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : error ? (
        <div className="error">{error}</div>
      ) : logs.length === 0 ? (
        <div className="emptyState compactEmptyState">
          <p>No training history yet. Add a practice log or training score sheet to start tracking practice volume.</p>
          <div className="btns compactEmptyActions">
            <Link href="/simple-training-logs/new" className="button smallButton">Add training log</Link>
          </div>
        </div>
      ) : (
        <div className="trainingHistoryList">
          {logs.map((item) => {
            if (item.kind === "training_score_sheet") {
              const { sheet } = item;
              return (
                <article className="sessionItem dashboardListItem" key={`sheet-${sheet.id}`}>
                  <div className="sessionContent">
                    <div className="sessionTopline compactTopline">
                      <strong>{sheet.title}</strong>
                      <span className="badge badgeGreen">Training score sheet</span>
                    </div>
                    <div className="small muted sessionMeta compactMeta">
                      <span>{formatTrainingDate(sheet.session_date)}</span>
                      <span>{sheet.total_targets} targets</span>
                      <span>{sheet.discipline}</span>
                      {sheet.location && <span>{sheet.location}</span>}
                    </div>
                  </div>
                  <div className="sessionActions simpleTrainingListActions">
                    <Link href={`/training-score-sheets/${sheet.id}`} className="button secondary smallButton">
                      Open
                    </Link>
                  </div>
                </article>
              );
            }

            const { log } = item;
            const percentage = hitPercentage(log);
            const isMinimumLog = isMinimumSimpleLog(log);
            return (
              <article className="sessionItem dashboardListItem" key={`practice-${log.id}`}>
                <div className="sessionContent">
                  <div className="sessionTopline compactTopline">
                    <strong>{log.discipline || "Practice log"}</strong>
                    <span className="badge badgeGreen">Practice log</span>
                  </div>
                  <div className="small muted sessionMeta compactMeta">
                    <span>{formatTrainingDate(log.date)}</span>
                    <span>{log.targets_fired} targets</span>
                    {log.hits !== null && <span>{log.hits} hits</span>}
                    {percentage !== null && <span>{percentage.toFixed(0)}%</span>}
                    {log.location && <span>{log.location}</span>}
                  </div>
                  {log.notes && <p className="small muted simpleTrainingNotes">{log.notes}</p>}
                  {isMinimumLog && (
                    <p className="small muted simpleTrainingNotes">Add hits, discipline or notes when you are ready.</p>
                  )}
                </div>
                <div className="sessionActions simpleTrainingListActions">
                  <Link href={`/simple-training-logs/${log.id}/edit`} className="button secondary smallButton">
                    {isMinimumLog ? "Add details" : "Edit"}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function PerformanceChart({ points, onPointClick }: { points: ChartPoint[]; onPointClick: (id: string) => void }) {
  const width = 720;
  const height = 220;
  const padding = 34;
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const rollingAveragePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.rollingAverageY}`).join(" ");
  const { minPercentage, maxPercentage, range } = chartBounds(points.flatMap((point) => [point.percentage, point.rollingAveragePercentage]));
  const referenceY = padding + (maxPercentage - 100) * ((height - padding * 2) / range);
  const baselineY = height - padding;
  const bestPercentage = Math.max(...points.map((point) => point.percentage));
  const bestIndex = points.findIndex((point) => point.percentage === bestPercentage);
  const shouldShowLabel = (index: number) => points.length <= 2 || index === points.length - 1 || index === bestIndex;

  return (
    <div className="chartWrap" aria-label="Connected line chart showing performance percentage over time, where winning score equals 100 percent">
      <svg className="performanceChart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <line x1={padding} x2={width - padding} y1={referenceY} y2={referenceY} className="chartReference" />
        <text x={padding} y={Math.max(referenceY - 8, 14)} className="chartText">
          100%
        </text>
        <line x1={padding} x2={padding} y1={padding} y2={baselineY} className="chartAxis" />
        <line x1={padding} x2={width - padding} y1={baselineY} y2={baselineY} className="chartAxis" />
        <text x={padding} y={Math.min(baselineY - 8, height - 10)} className="chartText">
          {minPercentage.toFixed(0)}%
        </text>
        <path d={rollingAveragePath} className="chartRollingLine" />
        <path d={path} className="chartLine" />
        {points.map((point, index) => (
          <g
            key={point.id}
            className="chartPointLink"
            role="button"
            tabIndex={0}
            aria-label={`Open ${point.name} from ${formatDate(point.date)} at ${point.percentage.toFixed(1)} percent vs winning score`}
            onClick={() => onPointClick(point.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onPointClick(point.id);
              }
            }}
          >
            <title>{`${point.name} · ${formatDate(point.date)} · ${point.percentage.toFixed(1)}% performance vs winning score`}</title>
            <circle cx={point.x} cy={point.y} r="13" className="chartPointHitArea" />
            <circle cx={point.x} cy={point.y} r="5" className="chartPoint" />
            {shouldShowLabel(index) && (
              <text x={point.x} y={Math.max(point.y - 12, 16)} textAnchor="middle" className="chartText chartPointLabel">
                {index === points.length - 1 ? "Latest" : "Best"} {point.percentage.toFixed(0)}%
              </text>
            )}
          </g>
        ))}
      </svg>
      <div className="chartLegend">
        <span>{points.length} result{points.length === 1 ? "" : "s"}</span>
        <span>Oldest {formatDate(points[0].date)}</span>
        <span>Newest {formatDate(points[points.length - 1].date)}</span>
        <span>Winning score = 100%</span>
        <span>Rolling average · Last 5 results</span>
      </div>
    </div>
  );
}

const PERIOD_OPTIONS: Array<{ value: PerformancePeriod; label: string }> = [
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "season", label: "This season" },
  { value: "12m", label: "Last 12 months" },
  { value: "all", label: "All time" },
];
const TYPE_OPTIONS: Array<{ value: PerformanceDataType; label: string }> = [
  { value: "competition", label: "Competition" },
  { value: "training", label: "Training" },
  { value: "all", label: "All" },
];

export default function StatsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [missCounts, setMissCounts] = useState<Record<string, number>>({});
  const [trainingLogs, setTrainingLogs] = useState<SimpleTrainingLog[]>([]);
  const [performanceTrainingLogs, setPerformanceTrainingLogs] = useState<PerformanceTrainingLog[]>([]);
  const [trainingScoreSheets, setTrainingScoreSheets] = useState<TrainingScoreSheetLog[]>([]);
  const [volumeLogs, setVolumeLogs] = useState<TrainingVolumeLog[]>([]);
  const [grounds, setGrounds] = useState<UserShootingGround[]>([]);
  const [selectedGroundKey, setSelectedGroundKey] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [selectedAssignmentGroundId, setSelectedAssignmentGroundId] = useState("");
  const [newGroundName, setNewGroundName] = useState("");
  const [savingGroundSessionId, setSavingGroundSessionId] = useState<string | null>(null);
  const [groundMessage, setGroundMessage] = useState<string | null>(null);
  const [groundError, setGroundError] = useState<string | null>(null);
  const [trainingLoadError, setTrainingLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedCompetitionYear, setSelectedCompetitionYear] = useState(() => new Date().getFullYear());
  const [selectedDiscipline, setSelectedDiscipline] = useState(() => searchParams.get("discipline") || "");
  const [selectedPeriod, setSelectedPeriod] = useState<PerformancePeriod>(() => {
    const value = searchParams.get("period");
    return value === "30d" || value === "90d" || value === "season" || value === "12m" || value === "all" ? value : "season";
  });
  const [selectedType, setSelectedType] = useState<PerformanceDataType>(() => {
    const value = searchParams.get("type");
    return value === "training" || value === "all" || value === "competition" ? value : "competition";
  });

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedDiscipline) params.set("discipline", selectedDiscipline);
    params.set("period", selectedPeriod);
    params.set("type", selectedType);
    router.replace(`/stats?${params.toString()}`, { scroll: false });
  }, [router, selectedDiscipline, selectedPeriod, selectedType]);

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      router.push("/login");
      return;
    }

    const todayValue = isoDateValue(new Date());
    const [sessionsResult, missesResult, recentTrainingResult, recentScoreSheetsResult, performanceTrainingResult, volumeTrainingResult, volumeScoreSheetsResult, groundsResult] = await Promise.all([
      supabase.from("sessions").select("*,user_shooting_grounds(display_name)").order("created_at", { ascending: false }).returns<SessionRow[]>(),
      supabase.from("misses").select("session_id,missed_target").returns<MissRow[]>(),
      supabase
        .from("training_logs")
        .select("id,date,targets_fired,hits,discipline,location,notes,source_type,created_at")
        .eq("source_type", "simple_training")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(10)
        .returns<SimpleTrainingLog[]>(),
      supabase
        .from("training_score_sheets")
        .select("id,title,session_date,location,discipline,session_type,number_of_posts,targets_per_post,total_targets,created_at")
        .order("session_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(10)
        .returns<TrainingScoreSheetLog[]>(),
      supabase
        .from("training_logs")
        .select("id,date,discipline,targets_fired,hits,source_type")
        .eq("source_type", "simple_training")
        .not("hits", "is", null)
        .gt("targets_fired", 0)
        .lte("date", todayValue)
        .order("date", { ascending: true })
        .returns<PerformanceTrainingLog[]>(),
      supabase
        .from("training_logs")
        .select("date,targets_fired,hits")
        .eq("source_type", "simple_training")
        .lte("date", todayValue)
        .order("date", { ascending: true })
        .returns<SimpleTrainingLog[]>(),
      supabase
        .from("training_score_sheets")
        .select("id,title,session_date,location,discipline,session_type,number_of_posts,targets_per_post,total_targets,created_at")
        .lte("session_date", todayValue)
        .order("session_date", { ascending: true })
        .returns<TrainingScoreSheetLog[]>(),
      supabase.from("user_shooting_grounds").select("id,display_name,normalized_display_name,country_code,municipality").order("display_name").returns<UserShootingGround[]>(),
    ]);

    const counts = countMissesBySession(missesResult.data || []);

    setSessions(sessionsResult.data || []);
    setGrounds(groundsResult.data || []);
    setMissCounts(counts);
    if (groundsResult.error) setGroundError("Personal shooting grounds could not be loaded right now.");
    if (recentTrainingResult.error || recentScoreSheetsResult.error || performanceTrainingResult.error || volumeTrainingResult.error || volumeScoreSheetsResult.error) {
      setTrainingLoadError("Training history could not be loaded right now.");
      setTrainingLogs([]);
      setTrainingScoreSheets([]);
      setPerformanceTrainingLogs([]);
      setVolumeLogs([]);
    } else {
      setTrainingLoadError("");
      setTrainingLogs(recentTrainingResult.data || []);
      setTrainingScoreSheets(recentScoreSheetsResult.data || []);
      setPerformanceTrainingLogs(performanceTrainingResult.data || []);
      setVolumeLogs([
        ...(volumeTrainingResult.data || []).map(simpleLogToVolumeLog),
        ...(volumeScoreSheetsResult.data || []).map(scoreSheetToVolumeLog),
      ]);
    }
    setLoading(false);
  }


  const performanceResults = useMemo<PerformanceResult[]>(() => {
    const competitionResults = sessions.flatMap((session): PerformanceResult[] => {
      if (session.session_type !== "Competition") return [];
      const score = scoreUsed(session, missCounts);
      if (!isUsableNumber(score)) return [];
      return [{
        id: session.id,
        date: session.competition_date || session.created_at,
        discipline: session.discipline || null,
        dataType: "competition",
        score,
        winningScore: session.winning_score || null,
        maxScore: session.total_targets || null,
      }];
    });
    const simpleTrainingResults = performanceTrainingLogs
      .filter((log) => log.hits !== null && log.targets_fired > 0)
      .map((log) => ({ id: log.id, date: log.date, discipline: log.discipline, dataType: "training" as const, score: log.hits || 0, maxScore: log.targets_fired }));
    return [...competitionResults, ...simpleTrainingResults];
  }, [sessions, missCounts, performanceTrainingLogs]);

  const disciplineOptions = useMemo(() => [...new Set(performanceResults.map((result) => result.discipline).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b)), [performanceResults]);

  const filteredPerformanceResults = useMemo(() => filterPerformanceResults(performanceResults, { discipline: selectedDiscipline || undefined, period: selectedPeriod, type: selectedType }), [performanceResults, selectedDiscipline, selectedPeriod, selectedType]);

  const performanceSummary = useMemo(() => calculatePerformanceSummary(performanceResults, filteredPerformanceResults, { discipline: selectedDiscipline || undefined, period: selectedPeriod, type: selectedType }), [performanceResults, filteredPerformanceResults, selectedDiscipline, selectedPeriod, selectedType]);

  const winnerContext = useMemo(() => calculateWinnerContext(filteredPerformanceResults), [filteredPerformanceResults]);

  const filteredCompetitionSessions = useMemo(() => {
    const allowedIds = new Set(filteredPerformanceResults.filter((result) => result.dataType === "competition").map((result) => result.id));
    return sessions.filter((session) => allowedIds.has(session.id));
  }, [sessions, filteredPerformanceResults]);

  const chartPoints = useMemo<ChartPoint[]>(() => {
    const scored = filteredCompetitionSessions
      .filter((session) => isUsableNumber(session.winning_score) && session.winning_score > 0)
      .map((session) => ({ session, result: percentageFor(session, missCounts) }))
      .filter((item): item is { session: SessionRow; result: { score: number; percentage: number } } => item.result !== null)
      .sort(sortOldestFirst);

    if (scored.length === 0) return [];

    const width = 720;
    const height = 220;
    const padding = 34;
    const rollingAverages = calculateRollingAverage(
      scored.map((item) => item.result.percentage),
      DEFAULT_ROLLING_WINDOW_SIZE,
    );
    const { maxPercentage, range } = chartBounds(
      scored.flatMap((item, index) => [item.result.percentage, rollingAverages[index] ?? item.result.percentage]),
    );

    return scored.map((item, index) => {
      const rollingAveragePercentage = rollingAverages[index] ?? item.result.percentage;
      const x = scored.length === 1 ? width / 2 : padding + index * ((width - padding * 2) / (scored.length - 1));
      const y = padding + (maxPercentage - item.result.percentage) * ((height - padding * 2) / range);
      const rollingAverageY = padding + (maxPercentage - rollingAveragePercentage) * ((height - padding * 2) / range);
      return {
        id: item.session.id,
        name: item.session.name,
        date: item.session.competition_date || item.session.created_at,
        percentage: item.result.percentage,
        rollingAveragePercentage,
        score: item.result.score,
        winningScore: item.session.winning_score || 0,
        discipline: item.session.discipline,
        leirdueResultUrl: item.session.leirdue_result_url || null,
        shootingGround: displayGroundForSession(item.session),
        x,
        y,
        rollingAverageY,
      };
    });
  }, [filteredCompetitionSessions, missCounts]);

  const summary = useMemo(() => {
    if (chartPoints.length === 0) return null;
    const percentages = chartPoints.map((point) => point.percentage);
    const rollingConsistency = calculateRollingStdDev(percentages, DEFAULT_ROLLING_WINDOW_SIZE);
    const latest = percentages[percentages.length - 1];
    const best = Math.max(...percentages);
    const average = percentages.reduce((sum, point) => sum + point, 0) / percentages.length;
    const latestConsistency = rollingConsistency[rollingConsistency.length - 1] ?? null;
    return {
      latest,
      best,
      average,
      latestConsistency,
    };
  }, [chartPoints]);

  const byShootingGround = useMemo<GroundSummary[]>(() => {
    const scored = filteredCompetitionSessions
      .map((session) => ({ session, result: percentageFor(session, missCounts) }))
      .filter((item): item is { session: SessionRow; result: { score: number; percentage: number } } => item.result !== null);
    const known = scored.filter((item) => displayGroundForSession(item.session) !== "Unknown shooting ground");
    const unknown = scored.filter((item) => displayGroundForSession(item.session) === "Unknown shooting ground");
    const rowsForSummary = known.length >= 2 || known.length >= unknown.length ? known : scored;
    const groups = new Map<string, Array<{ session: SessionRow; score: number; percentage: number }>>();

    for (const item of rowsForSummary) {
      const key = groundKeyForSession(item.session);
      groups.set(key, [...(groups.get(key) || []), { session: item.session, score: item.result.score, percentage: item.result.percentage }]);
    }

    return Array.from(groups.entries())
      .map(([key, groupSessions]) => {
        const sortedSessions = groupSessions.slice().sort((a, b) => sortableDate(a.session) - sortableDate(b.session));
        const percentages = groupSessions.map((item) => item.percentage);
        const sourceNames = [...new Set(groupSessions.map((item) => item.session.shooting_ground?.trim()).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b));
        const canonicalGroundId = groupSessions.find((item) => item.session.user_shooting_ground_id)?.session.user_shooting_ground_id || null;
        return {
          key,
          name: displayGroundForSession(groupSessions[0].session),
          canonicalGroundId,
          sourceNames,
          count: groupSessions.length,
          average: percentages.reduce((sum, value) => sum + value, 0) / percentages.length,
          best: Math.max(...percentages),
          latest: sortedSessions[sortedSessions.length - 1].percentage,
          latestDate: sortedSessions[sortedSessions.length - 1].session.competition_date || sortedSessions[sortedSessions.length - 1].session.created_at,
          sessions: sortedSessions.slice().reverse(),
        };
      })
      .filter((group) => group.name !== "Unknown shooting ground" || groups.size >= 2)
      .sort((a, b) => b.count - a.count || b.average - a.average);
  }, [filteredCompetitionSessions, missCounts]);

  const selectedGround = useMemo(() => byShootingGround.find((ground) => ground.key === selectedGroundKey) || null, [byShootingGround, selectedGroundKey]);

  const trainingHistoryItems = useMemo<TrainingHistoryItem[]>(() => [
    ...trainingLogs.map((log) => ({
      kind: "practice_log" as const,
      id: log.id,
      date: log.date,
      createdAt: log.created_at,
      log,
    })),
    ...trainingScoreSheets.map((sheet) => ({
      kind: "training_score_sheet" as const,
      id: sheet.id,
      date: sheet.session_date,
      createdAt: sheet.created_at,
      sheet,
    })),
  ].sort(sortTrainingHistoryItems).slice(0, 5), [trainingLogs, trainingScoreSheets]);

  const volumeInsights = useMemo(() => buildTrainingVolumeInsights(volumeLogs), [volumeLogs]);
  const competitionActivity = useMemo(
    () => buildCompetitionActivitySummary(sessions, selectedCompetitionYear),
    [sessions, selectedCompetitionYear],
  );
  async function saveSessionGround(sessionId: string) {
    const trimmedNewGroundName = newGroundName.trim();
    if (!selectedAssignmentGroundId && !trimmedNewGroundName) { setGroundError("Choose an existing ground or enter a new ground name."); return; }
    setSavingGroundSessionId(sessionId); setGroundError(null); setGroundMessage(null);
    let targetGroundId = selectedAssignmentGroundId;
    if (trimmedNewGroundName) {
      const { data, error } = await supabase.rpc("create_user_shooting_ground", { p_display_name: trimmedNewGroundName }) as { data: string | null; error: { message: string } | null };
      if (error || !data) { setGroundError(error?.message || "Could not create the shooting ground."); setSavingGroundSessionId(null); return; }
      targetGroundId = data;
    }
    const { error } = await supabase.rpc("assign_session_to_user_shooting_ground", { p_session_id: sessionId, p_ground_id: targetGroundId });
    if (error) { setGroundError(error.message); setSavingGroundSessionId(null); return; }
    setGroundMessage("Shooting ground changed for this competition only. The original imported ground name was preserved.");
    setEditingSessionId(null); setSelectedAssignmentGroundId(""); setNewGroundName(""); setSavingGroundSessionId(null); await load();
  }

  async function unassignSessionGround(sessionId: string) {
    if (!confirm("Remove the personal shooting ground assignment from this competition? The original imported ground name will be preserved.")) return;
    setSavingGroundSessionId(sessionId); setGroundError(null); setGroundMessage(null);
    const { error } = await supabase.rpc("unassign_session_from_user_shooting_ground", { p_session_id: sessionId });
    if (error) { setGroundError(error.message); setSavingGroundSessionId(null); return; }
    setGroundMessage("Personal shooting ground assignment removed for this competition only. The original imported ground name was preserved.");
    setEditingSessionId(null); setSavingGroundSessionId(null); await load();
  }

  const competitionTargetsThisYear = useMemo(() => {
    const yearStart = `${new Date().getFullYear()}-01-01`;
    return sessions
      .filter((session) => session.session_type === "Competition")
      .filter((session) => (session.competition_date || session.created_at) >= yearStart)
      .reduce((sum, session) => sum + (session.total_targets || 0), 0);
  }, [sessions]);

  return (
    <main>
      <div className="heroCard">
        <div>
          <p className="eyebrow">Performance</p>
          <h2>Performance</h2>
          <p>Review competition trends and training volume in one place.</p>
        </div>
        <div className="btns heroActions">
          <Link href="/dashboard" className="button secondary">
            Dashboard
          </Link>
          <Link href="/results" className="button secondary">
            Manage results
          </Link>
          <Link href="/log-competition" className="button">
            Log competition
          </Link>
          <Link href="/log-training" className="button secondary">
            Log training
          </Link>
        </div>
      </div>

      <CompetitionActivityCard
        summary={competitionActivity}
        selectedYear={selectedCompetitionYear}
        onSelectedYearChange={setSelectedCompetitionYear}
        loading={loading}
      />

      <section className="card statsFilterCard" aria-labelledby="performance-filters-heading">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Filters</p>
            <h2 id="performance-filters-heading">Performance filters</h2>
          </div>
        </div>
        <div className="performanceFilterGrid">
          <label>
            <span>Discipline</span>
            <select value={selectedDiscipline} onChange={(event) => setSelectedDiscipline(event.target.value)}>
              <option value="">All disciplines</option>
              {disciplineOptions.map((discipline) => <option key={discipline} value={discipline}>{discipline}</option>)}
            </select>
          </label>
          <label>
            <span>Period</span>
            <select value={selectedPeriod} onChange={(event) => setSelectedPeriod(event.target.value as PerformancePeriod)}>
              {PERIOD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            <span>Data type</span>
            <select value={selectedType} onChange={(event) => setSelectedType(event.target.value as PerformanceDataType)}>
              {TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>
        {selectedType === "all" && <p className="small muted filterHelper">Training and competition results may not be directly comparable.</p>}
      </section>

      <div className="card statsSummaryCard">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Filtered results</p>
            <h2>Performance summary</h2>
          </div>
        </div>
        {loading ? (
          <p>Loading...</p>
        ) : performanceSummary.count === 0 ? (
          <div className="emptyState compactEmptyState">
            <p>No scored results match these filters. Change the filters or add a result with enough scoring data.</p>
            <div className="btns compactEmptyActions">
              <Link href="/log-competition" className="button smallButton">Log competition</Link>
              <Link href="/log-training" className="button secondary smallButton">Log training</Link>
            </div>
          </div>
        ) : (
          <>
            <div className="summaryGrid compactSummaryGrid performanceSummaryGrid">
              <div className="summaryStat"><span>Recent average</span><strong>{formatMetricPercentage(performanceSummary.recentAverage)}</strong></div>
              <div className="summaryStat"><span>Best result</span><strong>{formatMetricPercentage(performanceSummary.best)}</strong></div>
              <div className="summaryStat"><span>Trend</span><strong>{performanceSummary.trend.label}</strong><p className="small muted">{formatSignedPercentagePoints(performanceSummary.trend.difference)}</p></div>
              <div className="summaryStat"><span>Results counted</span><strong>{performanceSummary.count}</strong><p className="small muted">Filtered scored results</p></div>
              <div className="summaryStat"><span>Data confidence</span><strong>{performanceSummary.confidence}</strong><p className="small muted">Confidence reflects sample size, not result quality.</p></div>
            </div>
            {selectedType === "competition" && (
              <div className="winnerContextPanel">
                <h3>Competition winner context</h3>
                {winnerContext.averageGap === null ? <p className="small muted">Not enough winner data yet.</p> : (
                  <div className="trainingVolumeMetricGrid compactTrainingVolumeGrid">
                    <MetricCard label="Average gap to winner" value={formatGap(winnerContext.averageGap)} helper={`${winnerContext.count} competition results with winner scores`} />
                    <MetricCard label="Best gap to winner" value={formatGap(winnerContext.bestGap)} />
                    <MetricCard label="Latest gap to winner" value={formatGap(winnerContext.latestGap)} />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <TrainingVolumeInsightsCard
        insights={volumeInsights}
        competitionTargetsThisYear={competitionTargetsThisYear}
        loading={loading}
        error={trainingLoadError}
      />

      <TrainingHistoryCard logs={trainingHistoryItems} loading={loading} error={trainingLoadError} />

      <div className="card statsRecentFormCard">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Recent form</p>
            <h2>Latest filtered results</h2>
          </div>
        </div>
        {loading ? <p>Loading...</p> : filteredPerformanceResults.length === 0 ? (
          <div className="emptyState compactEmptyState"><p>No recent form results match these filters.</p></div>
        ) : (
          <div className="recentFormList">
            {filteredPerformanceResults.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map((result) => {
              const session = result.dataType === "competition" ? sessions.find((item) => item.id === result.id) : null;
              const percentage = result.dataType === "competition" && result.winningScore ? (result.score / result.winningScore) * 100 : result.maxScore ? (result.score / result.maxScore) * 100 : null;
              return (
                <article className="statListItem" key={`${result.dataType}-${result.id}`}>
                  <div>
                    <strong>{session?.name || result.discipline || "Training result"}</strong>
                    <div className="small muted">{formatFullDate(result.date)} · {result.discipline || "No discipline"} · {result.dataType === "competition" ? "Competition" : "Training"}</div>
                    <div className="small muted">
                      Score {result.score}{result.winningScore ? ` · Winning score ${result.winningScore} · Gap ${Math.max(0, result.winningScore - result.score)} · Performance vs winning score ${percentage?.toFixed(1)}%` : result.maxScore ? ` / ${result.maxScore} · Hit rate ${percentage?.toFixed(1)}%` : ""}
                      {session && ` · Shooting ground: ${displayGroundForSession(session)}`}
                    </div>
                    {session && <div className="btns"><Link className="button secondary smallButton" href={`/sessions/${session.id}`}>Open result</Link>{session.leirdue_result_url && <a className="button secondary smallButton" href={session.leirdue_result_url} target="_blank" rel="noreferrer">Open Leirdue result</a>}</div>}
                  </div>
                  {percentage !== null && <span className="statPercent">{percentage.toFixed(1)}%</span>}
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className="card statsChartCard">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Trend</p>
            <h2>Competition chart</h2>
          </div>
        </div>
        {loading ? (
          <p>Loading...</p>
        ) : chartPoints.length === 0 ? (
          <div className="emptyState compactEmptyState">
            <p>{selectedType === "training" ? "The competition chart is competition-only and does not include training results." : "Chart appears after you add filtered competition results with winning score."}</p>
            <div className="btns compactEmptyActions">
              <Link href="/log-competition" className="button smallButton">Log competition</Link>
            </div>
          </div>
        ) : (
          <PerformanceChart points={chartPoints} onPointClick={(id) => router.push(`/sessions/${id}`)} />
        )}
      </div>

      {!loading && (
        <div className="card statsGroundCard">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">Shooting ground</p>
              <h2>By shooting ground</h2>
            </div>
          </div>
          {selectedType === "training" ? (
            <div className="emptyState compactEmptyState"><p>By shooting ground is competition-based and does not mix training venue data.</p></div>
          ) : byShootingGround.length < 2 ? (
            <div className="emptyState compactEmptyState"><p>Not enough filtered competition shooting ground data yet.</p></div>
          ) : (
            <div className="groundStatsGrid">
              {byShootingGround.map((ground) => (
              <button className="groundStat groundStatButton" key={ground.key} onClick={() => setSelectedGroundKey(ground.key)} type="button">
                <strong>{ground.name}</strong>
                <span>{ground.count} competition result{ground.count === 1 ? "" : "s"}</span>
                <span>Average {ground.average.toFixed(1)}%</span>
                <span>Best {ground.best.toFixed(1)}%</span>
                <span>Latest {ground.latest.toFixed(1)}%</span>
                <span className="groundStatAction">View ground details</span>
              </button>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedGround && (
        <div className="card statsGroundDetailCard">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">Ground details</p>
              <h2>{selectedGround.name}</h2>
              <p className="small muted">Review grouped competition sessions and correct one session at a time. The original imported ground name will be preserved.</p>
            </div>
            <button className="button secondary smallButton" type="button" onClick={() => setSelectedGroundKey(null)}>Close</button>
          </div>
          {groundError && <p className="errorText">{groundError}</p>}
          {groundMessage && <p className="successText">{groundMessage}</p>}
          <div className="groundDetailMetrics">
            <MetricCard label="Competition sessions" value={formatMetricNumber(selectedGround.count)} />
            <MetricCard label="Average score" value={`${selectedGround.average.toFixed(1)}%`} />
            <MetricCard label="Best score" value={`${selectedGround.best.toFixed(1)}%`} />
            <MetricCard label="Latest result" value={formatFullDate(selectedGround.latestDate)} />
          </div>
          <div className="groundSourceNames">
            <h3>Original source names</h3>
            {selectedGround.sourceNames.length === 0 ? <p className="muted">No original shooting ground name is saved for these sessions.</p> : <div className="chipList">{selectedGround.sourceNames.map((name) => <span className="metricChip" key={name}>{name}</span>)}</div>}
          </div>
          <div className="groundSessionList">
            {selectedGround.sessions.map(({ session, score, percentage }) => {
              const isEditing = editingSessionId === session.id;
              const currentGroundName = session.user_shooting_grounds?.display_name?.trim() || "Not assigned";
              return (
                <article className="statListItem groundSessionItem" key={session.id}>
                  <div>
                    <strong>{session.name}</strong>
                    <div className="small muted">{formatFullDate(session.competition_date || session.created_at)} · {session.discipline}</div>
                    <div className="small muted">Score {score}{session.winning_score ? ` · Winner ${session.winning_score} · Gap ${Math.max(0, session.winning_score - score)}` : ""} · Performance {percentage.toFixed(1)}%</div>
                    <div className="small muted">Original ground: {session.shooting_ground?.trim() || "No source name"}</div>
                    <div className="small muted">Current personal ground: {currentGroundName}</div>
                    <div className="btns">
                      <Link className="button secondary smallButton" href={`/sessions/${session.id}`}>Open result</Link>
                      {session.leirdue_result_url && <a className="button secondary smallButton" href={session.leirdue_result_url} target="_blank" rel="noreferrer">Open Leirdue result</a>}
                      <button className="button secondary smallButton" type="button" onClick={() => { setEditingSessionId(session.id); setSelectedAssignmentGroundId(session.user_shooting_ground_id || ""); setNewGroundName(""); setGroundError(null); setGroundMessage(null); }}>Change shooting ground</button>
                    </div>
                    {isEditing && (
                      <div className="groundAssignmentPanel">
                        <p className="small muted">The original imported ground name will be preserved.</p>
                        <label>Choose existing personal shooting ground</label>
                        <select value={selectedAssignmentGroundId} onChange={(event) => setSelectedAssignmentGroundId(event.target.value)}>
                          <option value="">Choose a ground</option>
                          {grounds.map((ground) => <option key={ground.id} value={ground.id}>{ground.display_name}</option>)}
                        </select>
                        <label>Or create a new personal shooting ground</label>
                        <input value={newGroundName} onChange={(event) => setNewGroundName(event.target.value)} placeholder="New shooting ground name" />
                        <div className="btns">
                          <button className="button smallButton" type="button" disabled={savingGroundSessionId === session.id} onClick={() => saveSessionGround(session.id)}>{savingGroundSessionId === session.id ? "Saving..." : "Save for this session"}</button>
                          {session.user_shooting_ground_id && <button className="button secondary smallButton" type="button" disabled={savingGroundSessionId === session.id} onClick={() => unassignSessionGround(session.id)}>Remove assignment</button>}
                          <button className="button secondary smallButton" type="button" onClick={() => setEditingSessionId(null)}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                  <span className="statPercent">{percentage.toFixed(1)}%</span>
                </article>
              );
            })}
          </div>
        </div>
      )}

      <div className="card statsListCard">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Result list</p>
            <h2>Scored results</h2>
          </div>
        </div>
        {loading ? (
          <p>Loading...</p>
        ) : chartPoints.length === 0 ? (
          <div className="emptyState compactEmptyState">
            <p>{selectedType === "training" ? "This scored result list is competition-only. Use Recent form above for filtered training results." : "Add filtered competition scoring data to populate this list."}</p>
            <div className="btns compactEmptyActions">
              <Link href="/log-competition" className="button smallButton">Log competition</Link>
            </div>
          </div>
        ) : (
          chartPoints
            .slice()
            .sort(sortNewestChartPoints)
            .map((point) => (
              <div className="statListItem" key={point.id}>
                <div>
                  <strong>{point.name}</strong>
                  <div className="small muted">{formatDate(point.date)}{point.shootingGround ? ` · Shooting ground: ${point.shootingGround}` : ""} · {point.discipline}</div>
                  <div className="small muted">Score used {point.score} · Winning score {point.winningScore} · Performance vs winning score {point.percentage.toFixed(1)}% · Rolling average {point.rollingAveragePercentage.toFixed(1)}%</div>
                  <div className="btns">
                    <Link className="button secondary smallButton" href={`/sessions/${point.id}`}>Open</Link>
                    {point.leirdueResultUrl && <a className="button secondary smallButton" href={point.leirdueResultUrl} target="_blank" rel="noreferrer">Open Leirdue result</a>}
                  </div>
                </div>
                <span className="statPercent">{point.percentage.toFixed(1)}%</span>
              </div>
            ))
        )}
      </div>
    </main>
  );
}
