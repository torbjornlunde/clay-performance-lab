"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getScoreSummary, MissForScore } from "@/lib/sessionScores";
import { supabase } from "@/lib/supabase/client";

type SessionRow = {
  id: string;
  name: string;
  discipline: string;
  session_type: string;
  total_targets: number | null;
  own_score: number | null;
  winning_score: number | null;
  created_at: string;
};

type MissRow = MissForScore & {
  session_id: string;
};

type ResultRow = {
  id: string;
  name: string;
  discipline: string;
  created_at: string;
  scoreUsed: number;
  winningScore: number;
  percentage: number;
  isManual: boolean;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

export default function StatsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [misses, setMisses] = useState<MissRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setErr("");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      router.push("/login");
      return;
    }

    const { data: sessionData, error: sessionError } = await supabase
      .from("sessions")
      .select("id,name,discipline,session_type,total_targets,own_score,winning_score,created_at")
      .eq("session_type", "Competition")
      .gt("winning_score", 0)
      .order("created_at", { ascending: false })
      .returns<SessionRow[]>();

    if (sessionError) {
      setErr(sessionError.message);
      setLoading(false);
      return;
    }

    const ids = (sessionData || []).map((session) => session.id);
    let missData: MissRow[] = [];
    if (ids.length > 0) {
      const { data, error } = await supabase
        .from("misses")
        .select("session_id,missed_target,first_where_miss,first_main_reason,first_target_read,first_comment,second_where_miss,second_main_reason,second_target_read,second_comment")
        .in("session_id", ids)
        .returns<MissRow[]>();
      if (error) {
        setErr(error.message);
        setLoading(false);
        return;
      }
      missData = data || [];
    }

    setSessions(sessionData || []);
    setMisses(missData);
    setLoading(false);
  }

  const results = useMemo<ResultRow[]>(() => {
    return sessions
      .map((session) => {
        const sessionMisses = misses.filter((miss) => miss.session_id === session.id);
        const score = getScoreSummary({ total_targets: session.total_targets, own_score: session.own_score, misses: sessionMisses });
        if (score.scoreUsed === null || !session.winning_score || session.winning_score <= 0) return null;
        return {
          id: session.id,
          name: session.name,
          discipline: session.discipline,
          created_at: session.created_at,
          scoreUsed: score.scoreUsed,
          winningScore: session.winning_score,
          percentage: (score.scoreUsed / session.winning_score) * 100,
          isManual: score.usesManualScore,
        };
      })
      .filter((result): result is ResultRow => result !== null);
  }, [misses, sessions]);

  return (
    <main>
      <div className="card">
        <h2>Stats</h2>
        <p>Competition results use your manual score when present, otherwise calculated score from logged misses.</p>
        <div className="btns">
          <Link href="/results/new" className="button">
            Add result only
          </Link>
          <Link href="/dashboard" className="button secondary">
            Dashboard
          </Link>
        </div>
      </div>
      <div className="card">
        <h2>Competition results</h2>
        {loading ? (
          <p>Loading...</p>
        ) : err ? (
          <div className="error">{err}</div>
        ) : results.length === 0 ? (
          <p>No competition results with a winning score yet.</p>
        ) : (
          results.map((result) => {
            const barWidth = Math.max(0, Math.min(result.percentage, 100));
            return (
              <div className="subcard" key={result.id}>
                <div className="sessionItem compact">
                  <div>
                    <strong>{result.name}</strong>
                    <div className="small muted">
                      {formatDate(result.created_at)} · {result.discipline} · {result.isManual ? "manual score" : "calculated score"}
                    </div>
                  </div>
                  <Link href={`/sessions/${result.id}`} className="button secondary">
                    Open
                  </Link>
                </div>
                <div className="statLine">
                  <span>Your score</span>
                  <strong>{result.scoreUsed}</strong>
                </div>
                <div className="statLine">
                  <span>Winning score</span>
                  <strong>{result.winningScore}</strong>
                </div>
                <div className="statLine">
                  <span>Percentage vs winner</span>
                  <strong>{result.percentage.toFixed(1)}%</strong>
                </div>
                <div className="barLabel small muted">Winner = 100%</div>
                <div className="barTrack" aria-label={`User percentage ${result.percentage.toFixed(1)}%`}>
                  <div className="barFill" style={{ width: `${barWidth}%` }} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
