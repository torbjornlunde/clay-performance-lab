"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { calculateRollingAverage, calculateRollingStdDev, DEFAULT_ROLLING_WINDOW_SIZE } from "@/lib/analysis/stats";
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
};

type MissRow = { session_id: string };

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

function sortableDate(session: SessionRow) {
  return new Date(session.competition_date || session.created_at).getTime();
}

function sortOldestFirst(a: { session: SessionRow }, b: { session: SessionRow }) {
  return sortableDate(a.session) - sortableDate(b.session);
}

function sortNewestChartPoints(a: ChartPoint, b: ChartPoint) {
  return new Date(b.date).getTime() - new Date(a.date).getTime();
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
  if (isUsableNumber(session.total_targets)) return Math.max(session.total_targets - (missCounts[session.id] || 0), 0);
  return null;
}

function percentageFor(session: SessionRow, missCounts: Record<string, number>) {
  const score = scoreUsed(session, missCounts);
  if (!isUsableNumber(score) || !isUsableNumber(session.winning_score) || session.winning_score <= 0) return null;
  return { score, percentage: (score / session.winning_score) * 100 };
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

export default function StatsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [missCounts, setMissCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      router.push("/login");
      return;
    }

    const { data } = await supabase.from("sessions").select("*").order("created_at", { ascending: false }).returns<SessionRow[]>();
    const { data: misses } = await supabase.from("misses").select("session_id").returns<MissRow[]>();
    const counts = (misses || []).reduce<Record<string, number>>((acc, miss) => {
      acc[miss.session_id] = (acc[miss.session_id] || 0) + 1;
      return acc;
    }, {});

    setSessions(data || []);
    setMissCounts(counts);
    setLoading(false);
  }

  const chartPoints = useMemo<ChartPoint[]>(() => {
    const scored = sessions
      .filter((session) => session.session_type === "Competition" && isUsableNumber(session.winning_score) && session.winning_score > 0)
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
        shootingGround: item.session.shooting_ground?.trim() || null,
        x,
        y,
        rollingAverageY,
      };
    });
  }, [sessions, missCounts]);

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

  const byShootingGround = useMemo(() => {
    const known = chartPoints.filter((point) => point.shootingGround);
    const unknown = chartPoints.filter((point) => !point.shootingGround);
    const pointsForSummary = known.length >= 2 || known.length >= unknown.length ? known : chartPoints;
    const groups = new Map<string, ChartPoint[]>();

    for (const point of pointsForSummary) {
      const name = point.shootingGround || "Unknown shooting ground";
      groups.set(name, [...(groups.get(name) || []), point]);
    }

    return Array.from(groups.entries())
      .map(([name, points]) => {
        const byDate = points.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const percentages = points.map((point) => point.percentage);
        return {
          name,
          count: points.length,
          average: percentages.reduce((sum, value) => sum + value, 0) / percentages.length,
          best: Math.max(...percentages),
          latest: byDate[byDate.length - 1].percentage,
        };
      })
      .filter((group) => group.name !== "Unknown shooting ground" || groups.size >= 2)
      .sort((a, b) => b.count - a.count || b.average - a.average);
  }, [chartPoints]);

  return (
    <main>
      <div className="heroCard">
        <div>
          <p className="eyebrow">Competition stats</p>
          <h2>Performance trend</h2>
          <p>Competition and result only performance vs winning score.</p>
        </div>
        <div className="btns heroActions">
          <Link href="/dashboard" className="button secondary">
            Dashboard
          </Link>
          <Link href="/results" className="button secondary">
            Manage results
          </Link>
          <Link href="/results/new" className="button">
            Add result only
          </Link>
          <Link href="/sessions/new" className="button secondary">
            New shooting log
          </Link>
        </div>
      </div>

      <div className="card statsSummaryCard">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Winning score = 100%</p>
            <h2>Summary</h2>
          </div>
        </div>
        {loading ? (
          <p>Loading...</p>
        ) : chartPoints.length === 0 ? (
          <div className="emptyState">No competition stats yet. Add a result only entry or add winning score to a competition shooting log.</div>
        ) : summary ? (
          <div className="summaryGrid compactSummaryGrid">
            <div className="summaryStat">
              <span>Latest</span>
              <strong>{summary.latest.toFixed(1)}%</strong>
            </div>
            <div className="summaryStat">
              <span>Average</span>
              <strong>{summary.average.toFixed(1)}%</strong>
            </div>
            <div className="summaryStat">
              <span>Best</span>
              <strong>{summary.best.toFixed(1)}%</strong>
            </div>
            <div className="summaryStat consistencyStat">
              <span>Consistency</span>
              <strong>{formatConsistency(summary.latestConsistency)}</strong>
              <p className="small muted">Lower is better</p>
            </div>
          </div>
        ) : null}
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
          <p className="muted">Chart appears after scoring data is available.</p>
        ) : (
          <PerformanceChart points={chartPoints} onPointClick={(id) => router.push(`/sessions/${id}`)} />
        )}
      </div>

      {!loading && byShootingGround.length >= 2 && (
        <div className="card statsGroundCard">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">Shooting ground</p>
              <h2>By shooting ground</h2>
            </div>
          </div>
          <div className="groundStatsGrid">
            {byShootingGround.map((ground) => (
              <div className="groundStat" key={ground.name}>
                <strong>{ground.name}</strong>
                <span>{ground.count} competition result{ground.count === 1 ? "" : "s"}</span>
                <span>Average {ground.average.toFixed(1)}%</span>
                <span>Best {ground.best.toFixed(1)}%</span>
                <span>Latest {ground.latest.toFixed(1)}%</span>
              </div>
            ))}
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
          <p className="muted">Add competition scoring data to populate this list.</p>
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
