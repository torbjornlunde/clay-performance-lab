"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type CompetitionSession = {
  id: string;
  name: string;
  created_at: string;
  own_score: number;
  winning_score: number;
};

type PerformanceRow = CompetitionSession & {
  performancePercentage: number;
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function StatsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<PerformanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const maxPercentage = useMemo(() => Math.max(100, ...sessions.map((session) => session.performancePercentage)), [sessions]);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setError("");
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      router.push("/login");
      return;
    }

    const { data, error: loadError } = await supabase
      .from("sessions")
      .select("id,name,created_at,own_score,winning_score")
      .eq("session_type", "Competition")
      .not("own_score", "is", null)
      .not("winning_score", "is", null)
      .gt("winning_score", 0)
      .order("created_at", { ascending: true })
      .returns<CompetitionSession[]>();

    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }

    setSessions(
      (data || []).map((session) => ({
        ...session,
        performancePercentage: (session.own_score / session.winning_score) * 100,
      })),
    );
    setLoading(false);
  }

  const chartWidth = 320;
  const rowHeight = 38;
  const chartHeight = Math.max(80, sessions.length * rowHeight + 20);

  return (
    <main>
      <div className="card">
        <h2>Stats</h2>
        <p>Competition performance compared with the winning score. Winning score is the 100% reference line.</p>
        <div className="btns">
          <button className="secondary" onClick={load}>Refresh</button>
          <Link href="/dashboard" className="button secondary">Dashboard</Link>
        </div>
      </div>

      <div className="card">
        <h2>Performance history</h2>
        {loading ? (
          <p>Loading...</p>
        ) : error ? (
          <div className="error">{error}</div>
        ) : sessions.length === 0 ? (
          <p>No competition scores yet. Add own and winning scores to Competition sessions to build this history.</p>
        ) : (
          <>
            <div className="chartWrap" aria-label="Competition performance chart">
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img">
                <line x1="230" y1="0" x2="230" y2={chartHeight} className="chartLine" />
                <text x="234" y="12" className="chartText">100%</text>
                {sessions.map((session, index) => {
                  const y = index * rowHeight + 22;
                  const barWidth = Math.max(2, (session.performancePercentage / maxPercentage) * 220);
                  return (
                    <g key={session.id}>
                      <text x="0" y={y - 6} className="chartText">{session.name.slice(0, 24)}</text>
                      <rect x="0" y={y} width={barWidth} height="12" rx="6" className="chartBar" />
                      <text x={Math.min(280, barWidth + 8)} y={y + 10} className="chartText">
                        {session.performancePercentage.toFixed(1)}%
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {sessions.map((session) => (
              <div className="sessionItem" key={session.id}>
                <div>
                  <strong>{session.name}</strong>
                  <div className="small muted">{formatDate(session.created_at)}</div>
                  <div className="small muted">
                    Own score {session.own_score} · Winning score {session.winning_score} · {session.performancePercentage.toFixed(1)}%
                  </div>
                </div>
                <Link href={`/sessions/${session.id}`} className="button secondary">Open</Link>
              </div>
            ))}
          </>
        )}
      </div>
    </main>
  );
}
