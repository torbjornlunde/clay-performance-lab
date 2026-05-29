"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type Row = {
  id: string;
  name: string;
  discipline: string;
  session_type: string;
  shooting_format: string | null;
  course_count: number | null;
  total_targets?: number | null;
  created_at: string;
  competition_date?: string | null;
  own_score?: number | null;
  winning_score?: number | null;
  calculated_score?: number | null;
};

type MissRow = { session_id: string };

type SessionGroup = {
  title: string;
  description: string;
  sessions: Row[];
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
  if (isUsableNumber(session.total_targets)) return Math.max(session.total_targets - missCountFor(session, missCounts), 0);
  return null;
}

function performancePercentage(session: Row, missCounts: Record<string, number>) {
  const score = scoreUsed(session, missCounts);
  if (!isUsableNumber(score) || !isUsableNumber(session.winning_score) || session.winning_score <= 0) return null;
  return (score / session.winning_score) * 100;
}

function isResultOnly(session: Row, missCounts: Record<string, number>) {
  return Boolean(
    isUsableNumber(session.own_score) &&
      isUsableNumber(session.winning_score) &&
      missCountFor(session, missCounts) === 0 &&
      !session.course_count,
  );
}

function typeLabel(session: Row, missCounts: Record<string, number>) {
  if (isResultOnly(session, missCounts)) return "Result only";
  return session.session_type === "Competition" ? "Competition" : "Training";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function SessionCard({ session, missCounts }: { session: Row; missCounts: Record<string, number> }) {
  const misses = missCountFor(session, missCounts);
  const percentage = performancePercentage(session, missCounts);
  const label = typeLabel(session, missCounts);

  return (
    <article className="sessionItem">
      <div>
        <div className="sessionTopline">
          <strong>{session.name}</strong>
          <span className={`badge ${label === "Competition" ? "badgeGold" : label === "Result only" ? "badgeBlue" : "badgeGreen"}`}>{label}</span>
        </div>
        <div className="small muted sessionMeta">
          <span>{session.discipline}</span>
          {session.shooting_format && <span>{session.shooting_format}</span>}
          <span>{formatDate(session.competition_date || session.created_at)}</span>
        </div>
        <div className="metricsRow">
          {session.course_count ? (
            <span className="metricChip">
              <strong>{session.course_count}</strong> courses
            </span>
          ) : null}
          <span className="metricChip">
            <strong>{misses}</strong> misses
          </span>
          {percentage !== null && (
            <span className="metricChip highlightMetric">
              <strong>{percentage.toFixed(1)}%</strong> vs winner
            </span>
          )}
        </div>
      </div>
      <Link href={`/sessions/${session.id}`} className="button secondary smallButton">
        Open
      </Link>
    </article>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Row[]>([]);
  const [missCounts, setMissCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

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

    const { data } = await supabase.from("sessions").select("*").order("created_at", { ascending: false }).returns<Row[]>();
    const { data: misses } = await supabase.from("misses").select("session_id").returns<MissRow[]>();
    const counts = (misses || []).reduce<Record<string, number>>((acc, miss) => {
      acc[miss.session_id] = (acc[miss.session_id] || 0) + 1;
      return acc;
    }, {});

    setSessions(data || []);
    setMissCounts(counts);
    setLoading(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const groups = useMemo<SessionGroup[]>(() => {
    const competitions = sessions.filter((session) => session.session_type === "Competition" && !isResultOnly(session, missCounts));
    const training = sessions.filter((session) => session.session_type !== "Competition" && !isResultOnly(session, missCounts));
    const resultOnly = sessions.filter((session) => isResultOnly(session, missCounts));
    return [
      { title: "Competitions", description: "Competition sessions with courses, misses or scoring context.", sessions: competitions },
      { title: "Training", description: "Practice sessions for logging and reviewing missed-target patterns.", sessions: training },
      { title: "Result-only entries", description: "Manual result entries without logged courses or misses.", sessions: resultOnly },
    ].filter((group) => group.sessions.length > 0);
  }, [sessions, missCounts]);

  return (
    <main>
      <div className="heroCard">
        <div>
          <p className="eyebrow">Shooter workspace</p>
          <h2>Dashboard</h2>
          <p>Create a session, log missed targets, then review analysis and competition trends.</p>
          <p className="small muted">Use Add competition result when you only want score statistics, without logging misses.</p>
        </div>
        <div className="btns heroActions">
          <Link href="/sessions/new" className="button">
            New session
          </Link>
          <Link href="/results/new" className="button secondary">
            Add competition result
          </Link>
          <Link href="/fitasc" className="button secondary">
            FITASC schemes
          </Link>
          <Link href="/stats" className="button secondary">
            Stats
          </Link>
          <button className="secondary" onClick={load}>
            Refresh
          </button>
          <button className="danger" onClick={logout}>
            Logout
          </button>
        </div>
      </div>

      <div className="card">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Session log</p>
            <h2>Sessions</h2>
          </div>
          {!loading && sessions.length > 0 && <span className="pill"><strong>{sessions.length}</strong> total</span>}
        </div>
        {loading ? (
          <p>Loading...</p>
        ) : sessions.length === 0 ? (
          <div className="emptyState">No sessions yet. Create your first training or competition session to start tracking.</div>
        ) : (
          groups.map((group) => (
            <section className="sessionGroup" key={group.title}>
              <div className="groupHeader">
                <div>
                  <h3>{group.title}</h3>
                  <p className="small muted">{group.description}</p>
                </div>
                <span className="countPill">{group.sessions.length}</span>
              </div>
              {group.sessions.map((session) => (
                <SessionCard key={session.id} session={session} missCounts={missCounts} />
              ))}
            </section>
          ))
        )}
      </div>
    </main>
  );
}
