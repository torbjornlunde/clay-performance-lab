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
  const width = 360;
  const height = 240;
  const paddingX = 34;
  const paddingTop = 28;
  const paddingBottom = 42;
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const maxPercentage = Math.max(100, ...points.map((point) => point.percentage));
  const minPercentage = Math.min(0, ...points.map((point) => point.percentage));
  const range = Math.max(maxPercentage - minPercentage, 1);
  const chartHeight = height - paddingTop - paddingBottom;
  const referenceY = paddingTop + (maxPercentage - 100) * (chartHeight / range);
  const labelEvery = Math.max(1, Math.ceil(points.length / 4));

  return (
    <div className="chartWrap" role="img" aria-label="Connected line chart showing performance percentage over time">
      <svg className="performanceChart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <line x1={paddingX} x2={width - paddingX} y1={referenceY} y2={referenceY} className="chartReference" />
        <text x={paddingX} y={Math.max(referenceY - 8, 14)} className="chartText">
          100% winning score
        </text>
        <line x1={paddingX} x2={paddingX} y1={paddingTop} y2={height - paddingBottom} className="chartAxis" />
        <line x1={paddingX} x2={width - paddingX} y1={height - paddingBottom} y2={height - paddingBottom} className="chartAxis" />
        <path d={path} className="chartLine" />
        {points.map((point, index) => (
          <g key={point.id}>
            <circle cx={point.x} cy={point.y} r="5" className="chartPoint" />
            {(index % labelEvery === 0 || index === points.length - 1) && (
              <>
                <text x={point.x} y={Math.max(point.y - 10, 14)} textAnchor="middle" className="chartText chartPointLabel">
                  {point.percentage.toFixed(0)}%
                </text>
                <text x={point.x} y={height - 14} textAnchor="middle" className="chartText chartDateLabel">
                  {formatDate(point.date)}
                </text>
              </>
            )}
          </g>
        ))}
      </svg>
      <div className="chartLegend">
        {points.map((point) => (
          <span key={point.id}>
            {formatDate(point.date)} · {point.percentage.toFixed(1)}%
          </span>
        ))}
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
      .filter((session) => session.session_type === "Competition")
      .map((session) => ({ session, result: percentageFor(session, missCounts) }))
      .filter((item): item is { session: SessionRow; result: { score: number; percentage: number } } => item.result !== null);

    if (scored.length === 0) return [];

    const width = 360;
    const height = 240;
    const paddingX = 34;
    const paddingTop = 28;
    const paddingBottom = 42;
    const maxPercentage = Math.max(100, ...scored.map((item) => item.result.percentage));
    const minPercentage = Math.min(0, ...scored.map((item) => item.result.percentage));
    const range = Math.max(maxPercentage - minPercentage, 1);

    return scored.map((item, index) => {
      const x = scored.length === 1 ? width / 2 : paddingX + index * ((width - paddingX * 2) / (scored.length - 1));
      const y = paddingTop + (maxPercentage - item.result.percentage) * ((height - paddingTop - paddingBottom) / range);
      return {
        id: item.session.id,
        name: item.session.name,
        date: item.session.created_at,
        percentage: item.result.percentage,
        score: item.result.score,
        winningScore: item.session.winning_score || 0,
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
          <p>Connected competition and result percentages over time, using your own score first and calculated score when available.</p>
        </div>
        <div className="btns heroActions">
          <Link href="/dashboard" className="button secondary">
            Dashboard
          </Link>
          <Link href="/sessions/new" className="button">
            New session
          </Link>
        </div>
      </div>

      <div className="card">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Winning score = 100%</p>
            <h2>Competition chart</h2>
          </div>
        </div>
        {loading ? (
          <p>Loading...</p>
        ) : chartPoints.length === 0 ? (
          <div className="emptyState">No competition stats yet. Add a competition result or add winning score to a competition session.</div>
        ) : (
          <>
            {summary && (
              <div className="summaryGrid">
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
            )}
            <PerformanceChart points={chartPoints} />
          </>
        )}
      </div>

      <div className="card">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Session details</p>
            <h2>Per-session stats</h2>
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
              <Link href={`/sessions/${point.id}`} className="statListItem" key={point.id}>
                <div>
                  <strong>{point.name}</strong>
                  <div className="small muted">{formatDate(point.date)} · {point.score} / {point.winningScore}</div>
                </div>
                <span className="statPercent">{point.percentage.toFixed(1)}%</span>
              </Link>
            ))
        )}
      </div>
    </main>
  );
}
