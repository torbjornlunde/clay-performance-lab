"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isOrdinaryLeirduesti } from "@/lib/disciplines";
import { calculateRollingAverage, DEFAULT_ROLLING_WINDOW_SIZE } from "@/lib/analysis/stats";
import { countMissesBySession, scoreFromMisses } from "@/lib/misses/scoring";
import { supabase } from "@/lib/supabase/client";

type Row = {
  id: string;
  name: string;
  discipline: string;
  session_type: string;
  shooting_format: string | null;
  course_count: number | null;
  total_targets?: number | null;
  sporttrap_series_count?: number | null;
  post_count?: number | null;
  targets_per_post?: number | null;
  created_at: string;
  competition_date?: string | null;
  date?: string | null;
  own_score?: number | null;
  winning_score?: number | null;
  calculated_score?: number | null;
  shooting_ground?: string | null;
};

type MissRow = { session_id: string; missed_target: string | null };

type TrainingScoreSheetRow = {
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

type SimpleTrainingLogRow = {
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

type TrainingHistoryItem =
  | { kind: "training_score_sheet"; id: string; date: string; createdAt: string; sheet: TrainingScoreSheetRow }
  | { kind: "practice_log"; id: string; date: string; createdAt: string; log: SimpleTrainingLogRow }
  | { kind: "detailed_training"; id: string; date: string; createdAt: string; session: Row };

type ChartPeriod = "month" | "year" | "all" | "custom";

type TrendPoint = {
  id: string;
  name: string;
  date: string;
  discipline: string;
  shootingGround: string | null;
  ownScore: number;
  winningScore: number;
  totalTargets: number | null;
  performancePercentage: number;
  rollingAveragePercentage: number;
  differenceFromRollingAverage: number;
  x: number;
  y: number;
  rollingAverageY: number;
};

function isUsableNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function missCountFor(session: Row, missCounts: Record<string, number>) {
  return missCounts[session.id] || 0;
}

function scoreUsed(session: Row, missCounts: Record<string, number>) {
  if (isUsableNumber(session.own_score)) return session.own_score;
  if (isUsableNumber(session.calculated_score)) return session.calculated_score;
  if (isUsableNumber(session.total_targets)) {
    return scoreFromMisses(session.total_targets, missCountFor(session, missCounts));
  }
  return null;
}

function performancePercentage(session: Row, missCounts: Record<string, number>) {
  const score = scoreUsed(session, missCounts);
  if (
    !isUsableNumber(score) ||
    !isUsableNumber(session.winning_score) ||
    session.winning_score <= 0
  ) {
    return null;
  }
  return (score / session.winning_score) * 100;
}

function hasScoreContext(session: Row) {
  return Boolean(
    isUsableNumber(session.own_score) ||
      isUsableNumber(session.winning_score) ||
      isUsableNumber(session.calculated_score) ||
      isUsableNumber(session.total_targets),
  );
}

function isResultSession(session: Row) {
  if (session.session_type === "Training") return false;
  return session.session_type === "Competition" || hasScoreContext(session);
}

function isTrainingSession(session: Row) {
  return session.session_type === "Training" || !isResultSession(session);
}

function isResultOnly(session: Row, missCounts: Record<string, number>) {
  return Boolean(
    session.session_type !== "Competition" ||
      (isUsableNumber(session.own_score) &&
        isUsableNumber(session.winning_score) &&
        missCountFor(session, missCounts) === 0 &&
        !session.course_count),
  );
}

function resultTypeLabel(session: Row, missCounts: Record<string, number>) {
  return isResultOnly(session, missCounts) ? "Result only" : "Competition";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function sortableDate(session: Row) {
  return new Date(session.competition_date || session.date || session.created_at).getTime();
}

function sortNewestFirst(a: Row, b: Row) {
  return sortableDate(b) - sortableDate(a);
}

function sortOldestFirst(a: Row, b: Row) {
  return sortableDate(a) - sortableDate(b);
}

function displayDate(session: Row) {
  return session.competition_date || session.date || session.created_at;
}

function displayedTotalTargets(session: Row) {
  const isSporttrap = session.discipline === "Sporttrap";
  const isLeirduesti = isOrdinaryLeirduesti(session.discipline);
  const sporttrapSeriesCount = isSporttrap
    ? session.sporttrap_series_count ||
      (session.total_targets ? Math.max(Math.round(session.total_targets / 25), 1) : 1)
    : null;
  const leirduestiPostCount = isLeirduesti
    ? session.post_count || session.course_count
    : null;
  const leirduestiTargetsPerPost = isLeirduesti
    ? session.targets_per_post ||
      (session.total_targets && leirduestiPostCount
        ? Math.max(Math.round(session.total_targets / leirduestiPostCount), 1)
        : 10)
    : null;

  if (isSporttrap && sporttrapSeriesCount) return sporttrapSeriesCount * 25;
  if (isLeirduesti && leirduestiPostCount && leirduestiTargetsPerPost) {
    return leirduestiPostCount * leirduestiTargetsPerPost;
  }
  return session.total_targets || null;
}

function adaptivePerformanceLowerBound(lowestPercentage: number) {
  if (lowestPercentage >= 90) return 80;
  if (lowestPercentage >= 80) return 70;
  if (lowestPercentage >= 70) return 60;
  if (lowestPercentage >= 60) return 50;
  if (lowestPercentage >= 0) return 0;
  return Math.floor(lowestPercentage / 10) * 10;
}

function chartBounds(percentages: number[], visiblePerformancePercentages = percentages) {
  const validPercentages = percentages.filter(isUsableNumber);
  const validVisiblePerformancePercentages = visiblePerformancePercentages.filter(isUsableNumber);

  if (validPercentages.length === 0 || validVisiblePerformancePercentages.length === 0) {
    return null;
  }

  const highest = Math.max(...validPercentages);
  const lowestVisiblePerformance = Math.min(...validVisiblePerformancePercentages);
  const maxPercentage = Math.max(100, Math.ceil(highest / 10) * 10);
  const minPercentage = adaptivePerformanceLowerBound(lowestVisiblePerformance);

  return { minPercentage, maxPercentage, range: Math.max(maxPercentage - minPercentage, 1) };
}

function dateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDifferenceFromRollingAverage(value: number) {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)} pp`;
}

function rollingAveragePositionLabel(value: number) {
  if (value > 0) return "Above rolling average";
  if (value < 0) return "Below rolling average";
  return "Matches rolling average";
}

function ResultCard({ session, missCounts }: { session: Row; missCounts: Record<string, number> }) {
  const score = scoreUsed(session, missCounts);
  const percentage = performancePercentage(session, missCounts);
  const totalTargets = displayedTotalTargets(session);
  const label = resultTypeLabel(session, missCounts);

  return (
    <article className="sessionItem dashboardListItem">
      <div className="sessionContent">
        <div className="sessionTopline compactTopline">
          <strong>{session.name}</strong>
          <span className={`badge ${label === "Competition" ? "badgeGold" : "badgeBlue"}`}>{label}</span>
        </div>
        <div className="small muted sessionMeta compactMeta">
          <span>{formatDate(displayDate(session))}</span>
          <span>{session.discipline}</span>
          {session.shooting_ground && <span>{session.shooting_ground}</span>}
        </div>
        <div className="resultMetrics">
          {isUsableNumber(score) && (
            <span>
              Score <strong>{score}{totalTargets ? ` / ${totalTargets}` : ""}</strong>
            </span>
          )}
          {isUsableNumber(session.winning_score) && (
            <span>
              Winning <strong>{session.winning_score}</strong>
            </span>
          )}
          {percentage !== null && (
            <span className="accentMetric">
              Vs winner <strong>{percentage.toFixed(1)}%</strong>
            </span>
          )}
        </div>
      </div>
      <div className="sessionActions">
        <Link href={`/sessions/${session.id}`} className="button secondary smallButton">Open</Link>
      </div>
    </article>
  );
}

function TrainingScoreSheetCard({ sheet }: { sheet: TrainingScoreSheetRow }) {
  return (
    <article className="sessionItem dashboardListItem">
      <div className="sessionContent">
        <div className="sessionTopline compactTopline">
          <strong>{sheet.title}</strong>
          <span className="badge badgeGreen">Training score sheet</span>
        </div>
        <div className="small muted sessionMeta compactMeta">
          <span>{formatDate(sheet.session_date)}</span>
          <span>{sheet.discipline}</span>
          {sheet.location && <span>{sheet.location}</span>}
        </div>
        <div className="resultMetrics">
          <span>Posts <strong>{sheet.number_of_posts}</strong></span>
          <span>Targets <strong>{sheet.total_targets}</strong></span>
          <span>Type <strong>{sheet.session_type === "shared_training" ? "Shared training" : "Training"}</strong></span>
        </div>
      </div>
      <div className="sessionActions">
        <Link href={`/training-score-sheets/${sheet.id}`} className="button secondary smallButton">Open</Link>
      </div>
    </article>
  );
}

function simpleTrainingHitPercentage(log: SimpleTrainingLogRow) {
  if (log.hits === null || log.targets_fired <= 0) return null;
  return (log.hits / log.targets_fired) * 100;
}

function SimpleTrainingLogCard({ log }: { log: SimpleTrainingLogRow }) {
  const percentage = simpleTrainingHitPercentage(log);

  return (
    <article className="sessionItem dashboardListItem">
      <div className="sessionContent">
        <div className="sessionTopline compactTopline">
          <strong>{log.discipline || "Practice log"}</strong>
          <span className="badge badgeGreen">Practice log</span>
        </div>
        <div className="small muted sessionMeta compactMeta">
          <span>{formatTrainingLogDate(log.date)}</span>
          <span>{log.targets_fired} targets</span>
          {log.hits !== null && <span>{log.hits} hits</span>}
          {percentage !== null && <span>{percentage.toFixed(0)}%</span>}
          {log.location && <span>{log.location}</span>}
        </div>
        {log.notes && <p className="small muted simpleTrainingNotes">{log.notes}</p>}
      </div>
      <div className="sessionActions">
        <Link href={`/simple-training-logs/${log.id}/edit`} className="button secondary smallButton">Edit</Link>
      </div>
    </article>
  );
}

function formatTrainingLogDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function sortTrainingHistoryItems(a: TrainingHistoryItem, b: TrainingHistoryItem) {
  const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
  if (dateDiff !== 0) return dateDiff;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function TrainingCard({ session, missCounts }: { session: Row; missCounts: Record<string, number> }) {
  const misses = missCountFor(session, missCounts);
  const totalTargets = displayedTotalTargets(session);

  return (
    <article className="sessionItem dashboardListItem">
      <div className="sessionContent">
        <div className="sessionTopline compactTopline">
          <strong>{session.name}</strong>
          <span className="badge badgeGreen">Training</span>
        </div>
        <div className="small muted sessionMeta compactMeta">
          <span>{formatDate(displayDate(session))}</span>
          <span>{session.discipline}</span>
          {session.shooting_ground && <span>{session.shooting_ground}</span>}
        </div>
        <div className="resultMetrics">
          <span>
            Misses <strong>{misses}</strong>
          </span>
          {totalTargets ? (
            <span>
              Targets <strong>{totalTargets}</strong>
            </span>
          ) : null}
        </div>
      </div>
      <div className="sessionActions">
        <Link href={`/sessions/${session.id}`} className="button secondary smallButton">Open</Link>
      </div>
    </article>
  );
}

function PerformanceTrendCard({
  sessions,
  missCounts,
}: {
  sessions: Row[];
  missCounts: Record<string, number>;
}) {
  const router = useRouter();
  const [period, setPeriod] = useState<ChartPeriod>("year");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);

  const allScored = useMemo(() => {
    return sessions
      .filter((session) => isResultSession(session) && isUsableNumber(session.winning_score) && session.winning_score > 0)
      .map((session) => ({ session, percentage: performancePercentage(session, missCounts), score: scoreUsed(session, missCounts) }))
      .filter((item): item is { session: Row; percentage: number; score: number } => item.percentage !== null && item.score !== null)
      .sort((a, b) => sortOldestFirst(a.session, b.session));
  }, [sessions, missCounts]);

  useEffect(() => {
    setPeriod(allScored.length > 0 ? "year" : "all");
    if (allScored.length > 0 && !customFrom && !customTo) {
      const latest = new Date(displayDate(allScored[allScored.length - 1].session));
      const from = new Date(latest);
      from.setFullYear(from.getFullYear() - 1);
      setCustomFrom(dateInputValue(from));
      setCustomTo(dateInputValue(latest));
    }
  }, [allScored.length, customFrom, customTo, allScored]);

  const filteredScored = useMemo(() => {
    if (allScored.length === 0 || period === "all") return allScored;

    const latest = new Date(displayDate(allScored[allScored.length - 1].session));
    const from = new Date(latest);
    if (period === "month") from.setMonth(from.getMonth() - 1);
    if (period === "year") from.setFullYear(from.getFullYear() - 1);

    return allScored.filter((item) => {
      const date = new Date(displayDate(item.session));
      if (period === "custom") {
        const afterFrom = customFrom ? date >= new Date(`${customFrom}T00:00:00`) : true;
        const beforeTo = customTo ? date <= new Date(`${customTo}T23:59:59`) : true;
        return afterFrom && beforeTo;
      }
      return date >= from && date <= latest;
    });
  }, [allScored, customFrom, customTo, period]);

  const points = useMemo<TrendPoint[]>(() => {
    if (filteredScored.length === 0) return [];
    const width = 720;
    const height = 180;
    const padding = 30;
    const rollingAverages = calculateRollingAverage(
      filteredScored.map((item) => item.percentage),
      DEFAULT_ROLLING_WINDOW_SIZE,
    );
    const chartValues = filteredScored.flatMap((item, index) => [
      item.percentage,
      rollingAverages[index] ?? item.percentage,
    ]);
    const bounds = chartBounds(chartValues, filteredScored.map((item) => item.percentage));

    if (!bounds) return [];

    const { maxPercentage, range } = bounds;

    return filteredScored.map((item, index) => {
      const rollingAveragePercentage = rollingAverages[index] ?? item.percentage;
      const x = filteredScored.length === 1 ? width / 2 : padding + index * ((width - padding * 2) / (filteredScored.length - 1));
      const y = padding + (maxPercentage - item.percentage) * ((height - padding * 2) / range);
      const rollingAverageY = padding + (maxPercentage - rollingAveragePercentage) * ((height - padding * 2) / range);
      return {
        id: item.session.id,
        name: item.session.name,
        date: displayDate(item.session),
        discipline: item.session.discipline,
        shootingGround: item.session.shooting_ground?.trim() || null,
        ownScore: item.score,
        winningScore: item.session.winning_score || 0,
        totalTargets: displayedTotalTargets(item.session),
        performancePercentage: item.percentage,
        rollingAveragePercentage,
        differenceFromRollingAverage: item.percentage - rollingAveragePercentage,
        x,
        y,
        rollingAverageY,
      };
    });
  }, [filteredScored]);

  const selectedPoint = points.find((point) => point.id === selectedPointId) || null;
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const rollingAveragePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.rollingAverageY}`).join(" ");
  const bounds = points.length > 0
    ? chartBounds(
        points.flatMap((point) => [point.performancePercentage, point.rollingAveragePercentage]),
        points.map((point) => point.performancePercentage),
      )
    : null;
  const width = 720;
  const height = 180;
  const padding = 30;
  const baselineY = height - padding;
  const referenceY = bounds
    ? padding + (bounds.maxPercentage - 100) * ((height - padding * 2) / bounds.range)
    : baselineY;

  function openStats() {
    router.push("/stats");
  }

  function handlePointClick(point: TrendPoint) {
    if (selectedPointId === point.id) {
      router.push(`/sessions/${point.id}`);
      return;
    }
    setSelectedPointId(point.id);
  }

  return (
    <section className="card dashboardTrendCard" aria-labelledby="trend-heading" onClick={openStats} role="link" tabIndex={0} onKeyDown={(event) => {
      if (event.key === "Enter") openStats();
    }}>
      <div className="sectionHeader dashboardTrendHeader">
        <div>
          <p className="eyebrow">Stats shortcut</p>
          <h2 id="trend-heading">Performance trend</h2>
          <p className="small muted trendHint">Performance vs winning score over time. Rolling average shows your trend across the latest 5 results.</p>
        </div>
        <span className="pill"><strong>{filteredScored.length}</strong> shown</span>
      </div>
      <div className="periodControls" onClick={(event) => event.stopPropagation()}>
        {(["month", "year", "all", "custom"] as ChartPeriod[]).map((option) => (
          <button key={option} type="button" className={`periodButton ${period === option ? "activePeriod" : ""}`} onClick={() => setPeriod(option)}>
            {option === "month" ? "Last month" : option === "year" ? "Last year" : option === "all" ? "All" : "Custom"}
          </button>
        ))}
      </div>
      {period === "custom" && (
        <div className="customPeriodControls" onClick={(event) => event.stopPropagation()}>
          <label>
            From
            <input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} />
          </label>
        </div>
      )}
      {/* Future: add year-over-year comparison. */}
      {points.length === 0 ? (
        <div className="emptyState compactEmptyState" onClick={(event) => event.stopPropagation()}>
          Add or import results to see your performance trend.
        </div>
      ) : (
        <div className="dashboardChartWrap">
          <svg className="performanceChart dashboardPerformanceChart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
            <line x1={padding} x2={width - padding} y1={referenceY} y2={referenceY} className="chartReference" />
            <text x={padding} y={Math.max(referenceY - 8, 14)} className="chartText">100%</text>
            <line x1={padding} x2={padding} y1={padding} y2={baselineY} className="chartAxis" />
            <line x1={padding} x2={width - padding} y1={baselineY} y2={baselineY} className="chartAxis" />
            {bounds ? <text x={padding} y={baselineY - 8} className="chartText">{bounds.minPercentage}%</text> : null}
            <path d={rollingAveragePath} className="chartRollingLine" />
            <path d={path} className="chartLine" />
            {points.map((point) => (
              <g key={point.id} className="chartPointLink" role="button" tabIndex={0} aria-label={`Preview ${point.name}`} onClick={(event) => {
                event.stopPropagation();
                handlePointClick(point);
              }} onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  handlePointClick(point);
                }
              }}>
                <circle cx={point.x} cy={point.y} r="14" className="chartPointHitArea" />
                <circle cx={point.x} cy={point.y} r="5" className={selectedPointId === point.id ? "chartPoint selectedChartPoint" : "chartPoint"} />
              </g>
            ))}
          </svg>
          <p className="dashboardScaleNote">Scale adjusted to highlight variation.</p>
          {selectedPoint && (
            <div className="chartPreview" onClick={(event) => event.stopPropagation()}>
              <strong>{selectedPoint.name}</strong>
              <span>{formatDate(selectedPoint.date)}</span>
              <span>{selectedPoint.discipline}{selectedPoint.shootingGround ? ` · ${selectedPoint.shootingGround}` : ""}</span>
              <span>Score: {selectedPoint.ownScore}{selectedPoint.totalTargets ? ` / ${selectedPoint.totalTargets}` : ""}</span>
              <span>Winning score: {selectedPoint.winningScore}</span>
              <span>Performance: {selectedPoint.performancePercentage.toFixed(1)}%</span>
              <span>Rolling average: {selectedPoint.rollingAveragePercentage.toFixed(1)}%</span>
              <span>Difference: {formatDifferenceFromRollingAverage(selectedPoint.differenceFromRollingAverage)} · {rollingAveragePositionLabel(selectedPoint.differenceFromRollingAverage)}</span>
              <small>Tap point again to open.</small>
            </div>
          )}
          <div className="chartLegend dashboardChartLegend">
            <span>Oldest {formatDate(points[0].date)}</span>
            <span>Newest {formatDate(points[points.length - 1].date)}</span>
            <span>Performance</span>
            <span>Rolling average · Last 5 results</span>
            <span>Entries without winning score skipped</span>
          </div>
        </div>
      )}
    </section>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Row[]>([]);
  const [trainingScoreSheets, setTrainingScoreSheets] = useState<TrainingScoreSheetRow[]>([]);
  const [simpleTrainingLogs, setSimpleTrainingLogs] = useState<SimpleTrainingLogRow[]>([]);
  const [missCounts, setMissCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [showAllResults, setShowAllResults] = useState(false);
  const [showAllTraining, setShowAllTraining] = useState(false);
  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      router.push("/login");
      return;
    }

    const { data } = await supabase
      .from("sessions")
      .select("*")
      .order("created_at", { ascending: false })
      .returns<Row[]>();
    const { data: misses } = await supabase
      .from("misses")
      .select("session_id,missed_target")
      .returns<MissRow[]>();
    const { data: scoreSheets } = await supabase
      .from("training_score_sheets")
      .select("id,title,session_date,location,discipline,session_type,number_of_posts,targets_per_post,total_targets,created_at")
      .order("session_date", { ascending: false })
      .order("created_at", { ascending: false })
      .returns<TrainingScoreSheetRow[]>();
    const { data: simpleLogs } = await supabase
      .from("training_logs")
      .select("id,date,targets_fired,hits,discipline,location,notes,source_type,created_at")
      .eq("source_type", "simple_training")
      .is("upgraded_session_id", null)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .returns<SimpleTrainingLogRow[]>();
    const counts = countMissesBySession(misses || []);

    setSessions((data || []).slice().sort(sortNewestFirst));
    setTrainingScoreSheets(scoreSheets || []);
    setSimpleTrainingLogs(simpleLogs || []);
    setMissCounts(counts);
    setLoading(false);
  }

  const results = useMemo(() => sessions.filter(isResultSession).sort(sortNewestFirst), [sessions]);
  const training = useMemo(() => sessions.filter(isTrainingSession).sort(sortNewestFirst), [sessions]);
  const visibleResults = showAllResults ? results : results.slice(0, 3);
  const trainingHistoryItems = useMemo<TrainingHistoryItem[]>(() => [
    ...trainingScoreSheets.map((sheet) => ({
      kind: "training_score_sheet" as const,
      id: sheet.id,
      date: sheet.session_date,
      createdAt: sheet.created_at,
      sheet,
    })),
    ...simpleTrainingLogs.map((log) => ({
      kind: "practice_log" as const,
      id: log.id,
      date: log.date,
      createdAt: log.created_at,
      log,
    })),
    ...training.map((session) => ({
      kind: "detailed_training" as const,
      id: session.id,
      date: displayDate(session),
      createdAt: session.created_at,
      session,
    })),
  ].sort(sortTrainingHistoryItems), [simpleTrainingLogs, training, trainingScoreSheets]);
  const visibleTrainingHistoryItems = showAllTraining ? trainingHistoryItems : trainingHistoryItems.slice(0, 3);

  return (
    <main className="dashboardMain">
      <div className="heroCard dashboardHero polishedDashboardHero">
        <div className="dashboardTopRow">
          <div>
            <p className="eyebrow">Shooter workspace</p>
            <h2>Dashboard</h2>
            <p className="dashboardHeroCopy">Choose a product area and continue with the right workflow.</p>
          </div>

        </div>
        <div className="dashboardPrimaryActions" aria-label="Dashboard product areas">
          <Link href="/log-competition" className="dashboardActionCard secondaryAction">
            <span>Log competition</span>
            <small>Record competition results manually, from scorecards, or from supported result services.</small>
          </Link>
          <Link href="/log-training" className="dashboardActionCard secondaryAction">
            <span>Log training</span>
            <small>Create training score sheets, personal training logs, or simple training results.</small>
          </Link>
          <Link href="/stats" className="dashboardActionCard secondaryAction">
            <span>Performance</span>
            <small>View trends, results, and performance insights.</small>
          </Link>
          <Link href="/coach-report" className="dashboardActionCard secondaryAction">
            <span>Coach report</span>
            <small>Select sessions from a date range and copy a private coach-ready summary.</small>
          </Link>
        </div>
      </div>

      <PerformanceTrendCard sessions={sessions} missCounts={missCounts} />

      <section className="card dashboardSectionCard" aria-labelledby="results-heading">
        <div className="sectionHeader listSectionHeader">
          <div>
            <p className="eyebrow">Competitions and scores</p>
            <h2 id="results-heading">Results</h2>
          </div>
          {!loading && <span className="countPill">{results.length}</span>}
        </div>
        {loading ? (
          <p>Loading...</p>
        ) : results.length === 0 ? (
          <div className="emptyState compactEmptyState">
            <p>Add or import a competition result to start tracking performance.</p>
            <div className="btns compactEmptyActions">
              <Link href="/log-competition" className="button smallButton">Log competition</Link>
            </div>
          </div>
        ) : (
          <>
            {visibleResults.map((session) => (
              <ResultCard key={session.id} session={session} missCounts={missCounts} />
            ))}
            {results.length > 3 && (
              <button type="button" className="button secondary showMoreButton" onClick={() => setShowAllResults((value) => !value)}>
                {showAllResults ? "Show less" : "Show more results"}
              </button>
            )}
          </>
        )}
      </section>

      <section className="card dashboardSectionCard" aria-labelledby="training-heading">
        <div className="sectionHeader listSectionHeader">
          <div>
            <p className="eyebrow">Training history</p>
            <h2 id="training-heading">Training</h2>
          </div>
          <div className="sectionHeaderActions">
            {!loading && <span className="countPill">{trainingHistoryItems.length}</span>}
            <Link href="/training-score-sheets" className="button secondary smallButton">Manage score sheets</Link>
          </div>
        </div>
        {loading ? (
          <p>Loading...</p>
        ) : trainingHistoryItems.length === 0 ? (
          <div className="emptyState compactEmptyState">
            <p>Create a shooting log or training score sheet to start tracking practice.</p>
            <div className="btns compactEmptyActions">
              <Link href="/log-training" className="button smallButton">Log training</Link>
            </div>
          </div>
        ) : (
          <>
            {visibleTrainingHistoryItems.map((item) => {
              if (item.kind === "training_score_sheet") {
                return <TrainingScoreSheetCard key={`sheet-${item.id}`} sheet={item.sheet} />;
              }
              if (item.kind === "practice_log") {
                return <SimpleTrainingLogCard key={`practice-${item.id}`} log={item.log} />;
              }
              return <TrainingCard key={`session-${item.id}`} session={item.session} missCounts={missCounts} />;
            })}
            {trainingHistoryItems.length > 3 && (
              <button type="button" className="button secondary showMoreButton" onClick={() => setShowAllTraining((value) => !value)}>
                {showAllTraining ? "Show less" : "Show more training"}
              </button>
            )}
          </>
        )}
      </section>
    </main>
  );
}
