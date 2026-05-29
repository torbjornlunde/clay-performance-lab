"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
};

type MissRow = { session_id: string };

type ChartPoint = {
  id: string;
  name: string;
  date: string;
  percentage: number;
  score: number;
  winningScore: number;
  discipline: string;
  leirdueResultUrl: string | null;
  x: number;
  y: number;
};

function isUsableNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
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

function PerformanceChart({ points }: { points: ChartPoint[] }) {
  const width = 720;
  const height = 240;
  const padding = 38;
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const maxPercentage = Math.max(100, ...points.map((point) => point.percentage));
  const minPercentage = Math.min(0, ...points.map((point) => point.percentage));
  const range = Math.max(maxPercentage - minPercentage, 1);
  const referenceY = padding + (maxPercentage - 100) * ((height - padding * 2) / range);
  const labelEvery = points.length > 8 ? Math.ceil(points.length / 5) : 1;
  const shouldShowLabel = (index: number) => index === 0 || index === points.length - 1 || index % labelEvery === 0;

  return (
    <div className="chartWrap" role="img" aria-label="Connected line chart showing performance percentage over time">
      <svg className="performanceChart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <line x1={padding} x2={width - padding} y1={referenceY} y2={referenceY} className="chartReference" />
        <text x={padding} y={Math.max(referenceY - 8, 14)} className="chartText">
          100%
        </text>
        <line x1={padding} x2={padding} y1={padding} y2={height - padding} className="chartAxis" />
        <line x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} className="chartAxis" />
        <path d={path} className="chartLine" />
        {points.map((point, index) => (
          <g key={point.id}>
            <circle cx={point.x} cy={point.y} r="5" className="chartPoint" />
            {shouldShowLabel(index) && (
              <text x={point.x} y={Math.max(point.y - 12, 16)} textAnchor="middle" className="chartText chartPointLabel">
                {point.percentage.toFixed(0)}%
              </text>
            )}
          </g>
        ))}
      </svg>
      <div className="chartLegend">
        <span>{points.length} result{points.length === 1 ? "" : "s"}</span>
        <span>First {formatDate(points[0].date)}</span>
        <span>Latest {formatDate(points[points.length - 1].date)}</span>
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

    const { data } = await supabase.from("sessions").select("*").order("created_at", { ascending: true }).returns<SessionRow[]>();
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
      .filter((item): item is { session: SessionRow; result: { score: number; percentage: number } } => item.result !== null);

    if (scored.length === 0) return [];

    const width = 720;
    const height = 240;
    const padding = 38;
    const maxPercentage = Math.max(100, ...scored.map((item) => item.result.percentage));
    const minPercentage = Math.min(0, ...scored.map((item) => item.result.percentage));
    const range = Math.max(maxPercentage - minPercentage, 1);

    return scored.map((item, index) => {
      const x = scored.length === 1 ? width / 2 : padding + index * ((width - padding * 2) / (scored.length - 1));
      const y = padding + (maxPercentage - item.result.percentage) * ((height - padding * 2) / range);
      return {
        id: item.session.id,
        name: item.session.name,
        date: item.session.competition_date || item.session.created_at,
        percentage: item.result.percentage,
        score: item.result.score,
        winningScore: item.session.winning_score || 0,
        discipline: item.session.discipline,
        leirdueResultUrl: item.session.leirdue_result_url || null,
        x,
        y,
      };
    });
  }, [sessions, missCounts]);

  const summary = useMemo(() => {
    if (chartPoints.length === 0) return null;
    const latest = chartPoints[chartPoints.length - 1].percentage;
    const best = Math.max(...chartPoints.map((point) => point.percentage));
    const average = chartPoints.reduce((sum, point) => sum + point.percentage, 0) / chartPoints.length;
    return { latest, best, average };
  }, [chartPoints]);

  return (
    <main>
      <div className="heroCard">
        <div>
          <p className="eyebrow">Competition stats</p>
          <h2>Performance trend</h2>
          <p>Competition and result only performance against the winning score.</p>
        </div>
        <div className="btns heroActions">
          <Link href="/dashboard" className="button secondary">
            Dashboard
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
              <span>Best</span>
              <strong>{summary.best.toFixed(1)}%</strong>
            </div>
            <div className="summaryStat">
              <span>Average</span>
              <strong>{summary.average.toFixed(1)}%</strong>
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
          <PerformanceChart points={chartPoints} />
        )}
      </div>

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
            .reverse()
            .map((point) => (
              <div className="statListItem" key={point.id}>
                <div>
                  <strong>{point.name}</strong>
                  <div className="small muted">{formatDate(point.date)} · {point.discipline} · Score used {point.score} / Winning {point.winningScore}</div>
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
