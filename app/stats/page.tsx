"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { calculateRollingAverage, calculateRollingStdDev, DEFAULT_ROLLING_WINDOW_SIZE } from "@/lib/analysis/stats";
import { countMissesBySession, scoreFromMisses } from "@/lib/misses/scoring";
import { buildCompetitionActivitySummary } from "@/lib/competitionActivity";
import { calculateDisciplineBreakdown, calculatePerformanceSummary, calculateWinnerContext, filterPerformanceResults, type DisciplinePerformanceBreakdown, type PerformanceDataType, type PerformancePeriod, type PerformanceResult } from "@/lib/performance/summary";
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
  notes?: string | null;
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
  discipline: string | null;
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

function percentageForPerformanceResult(result: PerformanceResult) {
  if (result.dataType === "competition" && result.winningScore && result.winningScore > 0) return (result.score / result.winningScore) * 100;
  if (result.dataType === "training" && result.maxScore && result.maxScore > 0) return (result.score / result.maxScore) * 100;
  return null;
}

function recentFormLine(results: PerformanceResult[]) {
  return results
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)
    .map((result) => percentageForPerformanceResult(result))
    .filter((value): value is number => value !== null)
    .map((value) => `${value.toFixed(0)}%`)
    .join(" · ");
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
    discipline: sheet.discipline || null,
  };
}

function simpleLogToVolumeLog(log: SimpleTrainingLog): TrainingVolumeLog {
  return {
    date: log.date,
    targets_fired: log.targets_fired,
    hits: log.hits,
    kind: "practice_log",
    discipline: log.discipline || null,
  };
}

function trainingSessionToVolumeLog(session: SessionRow, missCounts: Record<string, number>): TrainingVolumeLog | null {
  if (session.session_type !== "Training" || !isUsableNumber(session.total_targets) || session.total_targets <= 0) return null;
  const score = isUsableNumber(session.own_score) ? session.own_score : scoreFromMisses(session.total_targets, missCounts[session.id] || 0);
  return {
    date: session.competition_date || session.created_at.slice(0, 10),
    targets_fired: session.total_targets,
    hits: isUsableNumber(score) ? score : null,
    kind: "practice_log",
    discipline: session.discipline || null,
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

function TrainingVolumeInsightsCard({
  insights,
  loading,
  error,
}: {
  insights: TrainingVolumeInsights;
  loading: boolean;
  error: string;
}) {
  return (
    <section className="card statsTrainingVolumeCard trainingVolumeInsights" aria-labelledby="training-volume-heading">
      <div className="compactSectionHeader">
        <h2 id="training-volume-heading">Training volume</h2>
        <Link href="/training-score-sheets" className="subtleLink">View training →</Link>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : error ? (
        <div className="error">{error}</div>
      ) : (
        <>
          <div className="trainingVolumeCompactList">
            <p><strong>This year:</strong> {formatMetricNumber(insights.trainingTargetsThisYear)} targets · {formatMetricNumber(insights.trainingSessionsThisYear)} sessions</p>
            <p><strong>Last 30 days:</strong> {formatMetricNumber(insights.trainingTargetsLast30Days)} targets · {formatMetricNumber(insights.trainingSessionsLast30Days)} sessions</p>
            <p><strong>Average:</strong> {formatMetricNumber(insights.averageTargetsPerSessionThisYear)} targets/session</p>
          </div>
          {insights.insightMessages[0] && <p className="small muted trainingVolumeCompactInsight">{insights.insightMessages[0]}</p>}
        </>
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
  const [performanceTrainingLogs, setPerformanceTrainingLogs] = useState<PerformanceTrainingLog[]>([]);
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
  const [selectedDiscipline, setSelectedDiscipline] = useState(() => searchParams.get("discipline") || "");
  const [selectedPeriod, setSelectedPeriod] = useState<PerformancePeriod>(() => {
    const value = searchParams.get("period");
    return value === "30d" || value === "90d" || value === "season" || value === "12m" || value === "all" ? value : "season";
  });
  const [selectedCompetitionYear, setSelectedCompetitionYear] = useState(() => new Date().getFullYear());
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
    const [sessionsResult, missesResult, performanceTrainingResult, volumeTrainingResult, volumeScoreSheetsResult, groundsResult] = await Promise.all([
      supabase.from("sessions").select("*,user_shooting_grounds(display_name)").order("created_at", { ascending: false }).returns<SessionRow[]>(),
      supabase.from("misses").select("session_id,missed_target").returns<MissRow[]>(),
      supabase
        .from("training_logs")
        .select("id,date,discipline,targets_fired,hits,source_type")
        .eq("source_type", "simple_training")
        .is("upgraded_session_id", null)
        .not("hits", "is", null)
        .gt("targets_fired", 0)
        .lte("date", todayValue)
        .order("date", { ascending: true })
        .returns<PerformanceTrainingLog[]>(),
      supabase
        .from("training_logs")
        .select("date,discipline,targets_fired,hits")
        .eq("source_type", "simple_training")
        .is("upgraded_session_id", null)
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
    if (performanceTrainingResult.error || volumeTrainingResult.error || volumeScoreSheetsResult.error) {
      setTrainingLoadError("Training history could not be loaded right now.");
      setPerformanceTrainingLogs([]);
      setVolumeLogs([]);
    } else {
      setTrainingLoadError("");
      setPerformanceTrainingLogs(performanceTrainingResult.data || []);
      setVolumeLogs([
        ...(volumeTrainingResult.data || []).map(simpleLogToVolumeLog),
        ...(sessionsResult.data || []).map((session) => trainingSessionToVolumeLog(session, counts)).filter((log): log is TrainingVolumeLog => Boolean(log)),
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
    const detailedTrainingResults = sessions
      .filter((session) => session.session_type === "Training" && isUsableNumber(session.total_targets) && session.total_targets > 0)
      .map((session): PerformanceResult | null => {
        const score = isUsableNumber(session.own_score) ? session.own_score : scoreFromMisses(session.total_targets!, missCounts[session.id] || 0);
        return isUsableNumber(score) ? { id: session.id, date: session.competition_date || session.created_at, discipline: session.discipline || null, dataType: "training" as const, score, maxScore: session.total_targets } : null;
      })
      .filter((result): result is PerformanceResult => Boolean(result));
    const simpleTrainingResults = performanceTrainingLogs
      .filter((log) => log.hits !== null && log.targets_fired > 0)
      .map((log) => ({ id: log.id, date: log.date, discipline: log.discipline, dataType: "training" as const, score: log.hits || 0, maxScore: log.targets_fired }));
    return [...competitionResults, ...detailedTrainingResults, ...simpleTrainingResults];
  }, [sessions, missCounts, performanceTrainingLogs]);

  const disciplineOptions = useMemo(() => [...new Set(performanceResults.map((result) => result.discipline).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b)), [performanceResults]);

  const filteredPerformanceResults = useMemo(() => filterPerformanceResults(performanceResults, { discipline: selectedDiscipline || undefined, period: selectedPeriod, type: selectedType }), [performanceResults, selectedDiscipline, selectedPeriod, selectedType]);

  const performanceSummary = useMemo(() => calculatePerformanceSummary(performanceResults, filteredPerformanceResults, { discipline: selectedDiscipline || undefined, period: selectedPeriod, type: selectedType }), [performanceResults, filteredPerformanceResults, selectedDiscipline, selectedPeriod, selectedType]);

  const competitionOnlyResults = useMemo(() => filteredPerformanceResults.filter((result) => result.dataType === "competition"), [filteredPerformanceResults]);
  const trainingOnlyResults = useMemo(() => filteredPerformanceResults.filter((result) => result.dataType === "training"), [filteredPerformanceResults]);
  const competitionSummary = useMemo(() => calculatePerformanceSummary(performanceResults, competitionOnlyResults, { discipline: selectedDiscipline || undefined, period: selectedPeriod, type: "competition" }), [performanceResults, competitionOnlyResults, selectedDiscipline, selectedPeriod]);
  const trainingSummary = useMemo(() => calculatePerformanceSummary(performanceResults, trainingOnlyResults, { discipline: selectedDiscipline || undefined, period: selectedPeriod, type: "training" }), [performanceResults, trainingOnlyResults, selectedDiscipline, selectedPeriod]);
  const winnerContext = useMemo(() => calculateWinnerContext(competitionOnlyResults), [competitionOnlyResults]);

  const filteredCompetitionSessions = useMemo(() => {
    const allowedIds = new Set(competitionOnlyResults.map((result) => result.id));
    return sessions.filter((session) => allowedIds.has(session.id));
  }, [sessions, competitionOnlyResults]);

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
    const rowsForSummary = scored.filter((item) => displayGroundForSession(item.session) !== "Unknown shooting ground");
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
      .filter((group) => group.name !== "Unknown shooting ground")
      .sort((a, b) => b.count - a.count || b.average - a.average);
  }, [filteredCompetitionSessions, missCounts]);

  const selectedGround = useMemo(() => byShootingGround.find((ground) => ground.key === selectedGroundKey) || null, [byShootingGround, selectedGroundKey]);

  const competitionActivity = useMemo(() => buildCompetitionActivitySummary(sessions.filter((session) => !selectedDiscipline || session.discipline === selectedDiscipline).map((session) => ({ id: session.id, session_type: session.session_type, competition_date: session.competition_date || null, created_at: session.created_at, total_targets: session.total_targets, leirdue_result_url: session.leirdue_result_url, notes: session.notes })), selectedCompetitionYear), [sessions, selectedCompetitionYear, selectedDiscipline]);

  const disciplineBreakdown = useMemo<DisciplinePerformanceBreakdown[]>(() => calculateDisciplineBreakdown(filteredPerformanceResults), [filteredPerformanceResults]);

  const scopedVolumeLogs = useMemo(() => selectedDiscipline ? volumeLogs.filter((log) => log.discipline === selectedDiscipline) : volumeLogs, [volumeLogs, selectedDiscipline]);

  const dataCoverage = useMemo(() => {
    const scopedCompetitionResults = filteredPerformanceResults.filter((result) => result.dataType === "competition");
    const scopedTrainingResults = filteredPerformanceResults.filter((result) => result.dataType === "training");
    const scopedCompetitionSessions = filteredCompetitionSessions.filter((session) => !selectedDiscipline || session.discipline === selectedDiscipline);
    return {
      scoredCompetitionResults: selectedType === "training" ? null : scopedCompetitionResults.length,
      competitionsWithWinnerScore: selectedType === "training" ? null : scopedCompetitionResults.filter((result) => typeof result.winningScore === "number" && result.winningScore > 0).length,
      resultsWithShootingGround: selectedType === "training" ? null : scopedCompetitionSessions.filter((session) => displayGroundForSession(session) !== "Unknown shooting ground").length,
      trainingResultsWithHits: selectedType === "competition" ? null : scopedTrainingResults.length,
      trainingSessionsWithKnownVolume: selectedType === "competition" ? null : scopedVolumeLogs.filter((log) => log.targets_fired > 0).length,
      trainingLogsWithKnownHits: selectedType === "competition" ? null : scopedVolumeLogs.filter((log) => log.kind === "practice_log" && log.hits !== null && log.targets_fired > 0).length,
    };
  }, [filteredPerformanceResults, filteredCompetitionSessions, scopedVolumeLogs, selectedDiscipline, selectedType]);

  const volumeInsights = useMemo(() => buildTrainingVolumeInsights(scopedVolumeLogs), [scopedVolumeLogs]);
  const recentCompetitionFormLine = useMemo(() => recentFormLine(competitionOnlyResults), [competitionOnlyResults]);
  const recentTrainingFormLine = useMemo(() => recentFormLine(trainingOnlyResults), [trainingOnlyResults]);
  const recentCombinedFormLine = useMemo(() => recentFormLine(filteredPerformanceResults), [filteredPerformanceResults]);
  const hasDataCoverage = dataCoverage.scoredCompetitionResults !== null || dataCoverage.trainingSessionsWithKnownVolume !== null || dataCoverage.trainingResultsWithHits !== null;
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



  return (
    <main className="performancePage">
      <header className="statsPageHeader">
        <h1>Performance</h1>
        <p>Track form, trends and key performance patterns.</p>
      </header>

      <section className="card statsFilterCard compactStatsFilterCard" aria-labelledby="performance-filters-heading">
        <h2 id="performance-filters-heading" className="srOnly">Performance filters</h2>
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
        {selectedType === "all" && <p className="small muted filterHelper">Competition and Training are kept separate because winner-relative performance and hit percentage are different measures.</p>}
      </section>

      <div className="card statsSummaryCard">
        <div className="sectionHeader">
          <div>
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
            {selectedType === "all" && competitionOnlyResults.length > 0 && trainingOnlyResults.length > 0 ? (
              <div className="splitPerformanceSummary" aria-label="Separated Competition and Training summary">
                <div className="summaryStat"><span>Competition recent</span><strong>{formatMetricPercentage(competitionSummary.recentAverage)}</strong><p className="small muted">Winner-relative · {competitionSummary.count} results</p></div>
                <div className="summaryStat"><span>Competition trend</span><strong>{competitionSummary.trend.label}</strong></div>
                <div className="summaryStat"><span>Training recent</span><strong>{formatMetricPercentage(trainingSummary.recentAverage)}</strong><p className="small muted">Hit percentage · {trainingSummary.count} logs</p></div>
                <div className="summaryStat"><span>Training trend</span><strong>{trainingSummary.trend.label}</strong></div>
              </div>
            ) : (
              <div className="summaryGrid compactSummaryGrid performanceSummaryGrid">
                <div className="summaryStat"><span>Recent</span><strong>{formatMetricPercentage(performanceSummary.recentAverage)}</strong></div>
                <div className="summaryStat"><span>Best</span><strong>{formatMetricPercentage(performanceSummary.best)}</strong></div>
                <div className="summaryStat"><span>Trend</span><strong>{performanceSummary.trend.label}</strong><p className="small muted">{formatSignedPercentagePoints(performanceSummary.trend.difference)}</p></div>
                <div className="summaryStat"><span>Confidence</span><strong>{performanceSummary.confidence}</strong></div>
              </div>
            )}
            <p className="small muted summarySupportText">Based on {performanceSummary.count} result{performanceSummary.count === 1 ? "" : "s"}. Confidence reflects sample size.{selectedType === "all" ? " All view separates incompatible Competition and Training percentages." : ""}</p>
            {selectedType !== "training" && winnerContext.averageGap !== null && (
              <p className="winnerContextLine"><strong>Competition winner gap</strong> Average {formatGap(winnerContext.averageGap)} · Best {formatGap(winnerContext.bestGap)} · Latest {formatGap(winnerContext.latestGap)}</p>
            )}
          </>
        )}
      </div>

      {!loading && chartPoints.length > 0 && (
        <div className="card statsChartCard compactStatsChartCard">
        <div className="sectionHeader">
          <div>
            <h2>{selectedType === "all" ? "Competition trend" : "Trend"}</h2>
          </div>
        </div>
          <PerformanceChart points={chartPoints} onPointClick={(id) => router.push(`/sessions/${id}`)} />
        </div>
      )}

      {!loading && (selectedType === "competition" || selectedType === "all") && competitionActivity.allTimeCompetitionCount > 0 && (
        <section className="card statsCompetitionActivityCard compactCompetitionActivityCard" aria-labelledby="stats-competition-activity-heading">
          <div className="compactSectionHeader">
            <div>
              <p className="eyebrow">Activity & form</p>
              <h2 id="stats-competition-activity-heading">Competition activity</h2>
              {selectedDiscipline && <p className="small muted">Filtered to {selectedDiscipline}. All time ignores the Performance period filter.</p>}
            </div>
            <label className="competitionYearSelector compactYearSelector">
              <span>Year</span>
              <select value={selectedCompetitionYear} onChange={(event) => setSelectedCompetitionYear(Number(event.target.value))}>
                {[...new Set([selectedCompetitionYear, ...competitionActivity.years])].sort((a, b) => b - a).map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </label>
          </div>
          <div className="competitionActivityCompactGrid">
            <div><span>All time</span><strong>{formatMetricNumber(competitionActivity.allTimeCompetitionCount)} competitions · {formatMetricNumber(competitionActivity.allTimeCompetitionTargetCount)} known targets</strong>{competitionActivity.hasUnknownAllTimeTargets && <small>Some competitions have unknown target count.</small>}</div>
            <div><span>{selectedCompetitionYear}</span><strong>{formatMetricNumber(competitionActivity.selectedYearCompetitionCount)} competitions · {formatMetricNumber(competitionActivity.selectedYearCompetitionTargetCount)} known targets</strong>{competitionActivity.hasUnknownSelectedYearTargets && <small>Known targets only.</small>}</div>
          </div>
        </section>
      )}


      {!loading && filteredPerformanceResults.length > 0 && (
        <section className="card statsRecentFormCard compactRecentFormCard">
          <div className="compactSectionHeader">
            <h2>Recent form</h2>
            <Link href="/results" className="subtleLink">View all results →</Link>
          </div>
          {selectedType === "all" && competitionOnlyResults.length > 0 && trainingOnlyResults.length > 0 ? (
            <div className="recentFormSplit">
              <div><strong>Competition</strong><p>{recentCompetitionFormLine || "No recent scored competitions"}</p><small>{competitionOnlyResults.length} recent result{competitionOnlyResults.length === 1 ? "" : "s"}</small></div>
              <div><strong>Training</strong><p>{recentTrainingFormLine || "No recent scored training"}</p><small>{trainingOnlyResults.length} recent log{trainingOnlyResults.length === 1 ? "" : "s"}</small></div>
            </div>
          ) : (
            <div className="recentFormSplit singleRecentForm">
              <div><strong>{selectedType === "training" ? "Training" : "Competition"}</strong><p>{recentCombinedFormLine}</p><small>{filteredPerformanceResults.length} recent {selectedType === "training" ? "log" : "result"}{filteredPerformanceResults.length === 1 ? "" : "s"}</small></div>
            </div>
          )}
        </section>
      )}




      {!loading && (selectedType === "training" || selectedType === "all") && (
        <TrainingVolumeInsightsCard
          insights={volumeInsights}
          loading={loading}
          error={trainingLoadError}
        />
      )}

      {!loading && disciplineBreakdown.length > 0 && (
        <section className="card statsBreakdownCard">
          <details>
            <summary>By discipline</summary>
            <p className="small muted">Competition uses winner-relative performance; Training uses hit percentage. Single-result disciplines are shown as coverage, not strong conclusions.</p>
            <div className="disciplineBreakdownList">
              {disciplineBreakdown.map((item) => (
                <div className="disciplineBreakdownItem" key={item.discipline}>
                  <strong>{item.discipline}</strong>
                  {selectedType !== "training" && item.competitionCount > 0 && <p className="small muted">Competition: {item.competitionCount} result{item.competitionCount === 1 ? "" : "s"}{item.competitionAverage !== null ? ` · Avg ${item.competitionAverage.toFixed(1)}% · Recent ${formatMetricPercentage(item.competitionRecent)} · Best ${formatMetricPercentage(item.competitionBest)}` : ""}{item.averageWinnerGap !== null ? ` · Avg gap ${formatGap(item.averageWinnerGap)}` : ""}</p>}
                  {selectedType !== "competition" && item.trainingCount > 0 && <p className="small muted">Training: {item.trainingCount} log{item.trainingCount === 1 ? "" : "s"}{item.trainingHitAverage !== null ? ` · Hit average ${formatMetricPercentage(item.trainingHitAverage)}` : " · no hit percentage yet"}</p>}
                </div>
              ))}
            </div>
          </details>
        </section>
      )}

      {!loading && (winnerContext.averageGap !== null || hasDataCoverage) && (
        <section className="card deeperPerformanceDataCard">
          <div className="compactSectionHeader"><h2>Deeper performance data</h2></div>
          {winnerContext.averageGap !== null && (
            <details>
              <summary>Benchmark / winner details</summary>
              <div className="trainingVolumeCompactList">
                <p><strong>Average gap:</strong> {formatGap(winnerContext.averageGap)}</p>
                <p><strong>Best gap:</strong> {formatGap(winnerContext.bestGap)}</p>
                <p><strong>Latest gap:</strong> {formatGap(winnerContext.latestGap)}</p>
                <p><strong>Usable competitions:</strong> {formatMetricNumber(winnerContext.count)}</p>
              </div>
            </details>
          )}
          <details>
            <summary>Data coverage</summary>
            <div className="trainingVolumeCompactList">
              {dataCoverage.scoredCompetitionResults !== null && <p><strong>Scored Competition results in this view:</strong> {formatMetricNumber(dataCoverage.scoredCompetitionResults)}</p>}
              {dataCoverage.competitionsWithWinnerScore !== null && <p><strong>Competitions with winner score in this view:</strong> {formatMetricNumber(dataCoverage.competitionsWithWinnerScore)}</p>}
              {dataCoverage.resultsWithShootingGround !== null && <p><strong>Competition results with shooting ground in this view:</strong> {formatMetricNumber(dataCoverage.resultsWithShootingGround)}</p>}
              {dataCoverage.trainingResultsWithHits !== null && <p><strong>Training logs with hit percentage in this view:</strong> {formatMetricNumber(dataCoverage.trainingResultsWithHits)}</p>}
              {dataCoverage.trainingSessionsWithKnownVolume !== null && <p><strong>{selectedDiscipline ? "All-time Training sessions with known target volume for this discipline" : "All-time Training sessions with known target volume"}:</strong> {formatMetricNumber(dataCoverage.trainingSessionsWithKnownVolume)}</p>}
              {dataCoverage.trainingLogsWithKnownHits !== null && <p><strong>{selectedDiscipline ? "All-time Training logs with known hits for this discipline" : "All-time Training logs with known hits"}:</strong> {formatMetricNumber(dataCoverage.trainingLogsWithKnownHits)}</p>}
            </div>
          </details>
        </section>
      )}

      {!loading && selectedType !== "training" && byShootingGround.length >= 2 && (
        <div className="card statsGroundCard compactGroundCard">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">Shooting ground</p>
              <h2>By shooting ground</h2>
            </div>
          </div>
          <div className="groundStatsGrid">
              {byShootingGround.map((ground) => (
              <button className="groundStat groundStatButton" key={ground.key} onClick={() => setSelectedGroundKey(ground.key)} type="button">
                <strong>{ground.name}</strong>
                <span>{ground.count} result{ground.count === 1 ? "" : "s"} · Avg {ground.average.toFixed(1)}% · Best {ground.best.toFixed(1)}%</span>
              </button>
              ))}
            </div>
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
            {selectedGround.sessions.slice(0, 5).map(({ session, score, percentage }) => {
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
          <Link href="/results" className="subtleLink">View all results →</Link>
          </div>
        </div>
      )}


    </main>
  );
}
