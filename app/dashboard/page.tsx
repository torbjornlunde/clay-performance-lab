"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  ExportCourse,
  ExportMiss,
  ExportTargetDefinition,
} from "@/lib/export/exportUserData";
import { isOrdinaryLeirduesti } from "@/lib/disciplines";
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
  own_score?: number | null;
  winning_score?: number | null;
  calculated_score?: number | null;
  shooting_ground?: string | null;
};

type MissRow = { session_id: string };

type ExportCourseRow = ExportCourse;
type ExportMissRow = ExportMiss;
type ExportTargetDefinitionRow = ExportTargetDefinition;

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
  if (isUsableNumber(session.total_targets))
    return Math.max(
      session.total_targets - missCountFor(session, missCounts),
      0,
    );
  return null;
}

function performancePercentage(
  session: Row,
  missCounts: Record<string, number>,
) {
  const score = scoreUsed(session, missCounts);
  if (
    !isUsableNumber(score) ||
    !isUsableNumber(session.winning_score) ||
    session.winning_score <= 0
  )
    return null;
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
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function sortableDate(session: Row) {
  return new Date(session.competition_date || session.created_at).getTime();
}

function sortNewestFirst(a: Row, b: Row) {
  return sortableDate(b) - sortableDate(a);
}

function SessionCard({
  session,
  missCounts,
}: {
  session: Row;
  missCounts: Record<string, number>;
}) {
  const misses = missCountFor(session, missCounts);
  const percentage = performancePercentage(session, missCounts);
  const label = typeLabel(session, missCounts);
  const isSporttrap = session.discipline === "Sporttrap";
  const isLeirduesti = isOrdinaryLeirduesti(session.discipline);
  const sporttrapSeriesCount = isSporttrap
    ? session.sporttrap_series_count ||
      (session.total_targets
        ? Math.max(Math.round(session.total_targets / 25), 1)
        : 1)
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
  const displayedTotalTargets =
    isSporttrap && sporttrapSeriesCount
      ? sporttrapSeriesCount * 25
      : isLeirduesti && leirduestiPostCount && leirduestiTargetsPerPost
        ? leirduestiPostCount * leirduestiTargetsPerPost
        : session.total_targets;

  return (
    <article className="sessionItem">
      <div className="sessionContent">
        <div className="sessionTopline">
          <strong>{session.name}</strong>
          <span
            className={`badge ${label === "Competition" ? "badgeGold" : label === "Result only" ? "badgeBlue" : "badgeGreen"}`}
          >
            {label}
          </span>
        </div>
        <div className="small muted sessionMeta">
          <span>
            {formatDate(session.competition_date || session.created_at)}
          </span>
          {session.shooting_ground && (
            <span>Shooting ground: {session.shooting_ground}</span>
          )}
          <span>{session.discipline}</span>
          {session.shooting_format && <span>{session.shooting_format}</span>}
        </div>
        <div className="metricsRow">
          {isSporttrap && sporttrapSeriesCount ? (
            <span className="metricChip">
              <strong>{sporttrapSeriesCount}</strong> 25-target series
            </span>
          ) : isLeirduesti && leirduestiPostCount ? (
            <span className="metricChip">
              <strong>{leirduestiPostCount}</strong> posts
            </span>
          ) : session.course_count ? (
            <span className="metricChip">
              <strong>{session.course_count}</strong> courses
            </span>
          ) : null}
          {isLeirduesti && leirduestiTargetsPerPost ? (
            <span className="metricChip">
              <strong>{leirduestiTargetsPerPost}</strong> targets per post
            </span>
          ) : null}
          {displayedTotalTargets ? (
            <span className="metricChip">
              <strong>{displayedTotalTargets}</strong> total targets
            </span>
          ) : null}
          <span className="metricChip">
            <strong>{misses}</strong> misses
          </span>
          {percentage !== null && (
            <span className="metricChip highlightMetric">
              <strong>{percentage.toFixed(1)}%</strong> performance vs winning
              score
            </span>
          )}
        </div>
      </div>
      <div className="sessionActions">
        <Link
          href={`/sessions/${session.id}`}
          className="button secondary smallButton"
        >
          Open
        </Link>
      </div>
    </article>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Row[]>([]);
  const [missCounts, setMissCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

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
      .select("session_id")
      .returns<MissRow[]>();
    const counts = (misses || []).reduce<Record<string, number>>(
      (acc, miss) => {
        acc[miss.session_id] = (acc[miss.session_id] || 0) + 1;
        return acc;
      },
      {},
    );

    setSessions((data || []).slice().sort(sortNewestFirst));
    setMissCounts(counts);
    setLoading(false);
  }

  async function exportMyData() {
    setExportError("");
    setExporting(true);

    try {
      const { data: u, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!u.user) {
        router.push("/login");
        return;
      }

      const { data: sessionData, error: sessionError } = await supabase
        .from("sessions")
        .select("*")
        .eq("user_id", u.user.id)
        .order("created_at", { ascending: false })
        .returns<Row[]>();
      if (sessionError) throw sessionError;

      const exportSessions = sessionData || [];
      const sessionIds = exportSessions.map((session) => session.id);
      let exportCourses: ExportCourseRow[] = [];
      let exportMisses: ExportMissRow[] = [];
      let exportTargetDefinitions: ExportTargetDefinitionRow[] = [];

      if (sessionIds.length > 0) {
        const [coursesResult, missesResult, definitionsResult] =
          await Promise.all([
            supabase
              .from("session_courses")
              .select(
                "session_id,course_number,fitasc_scheme,shooter_number,start_plate",
              )
              .in("session_id", sessionIds)
              .order("course_number")
              .returns<ExportCourseRow[]>(),
            supabase
              .from("misses")
              .select(
                "session_id,course_number,plate,target_number,target_label,target_type,base_presentation,actual_presentation,presented_pair_label,shooting_order_label,is_reversed_order,missed_target,where_miss,main_reason,target_read,comment,first_where_miss,first_main_reason,first_target_read,first_comment,second_where_miss,second_main_reason,second_target_read,second_comment,created_at",
              )
              .in("session_id", sessionIds)
              .order("created_at")
              .returns<ExportMissRow[]>(),
            supabase
              .from("session_target_definitions")
              .select(
                "session_id,course_number,machine,target_type,direction,speed,distance,difficulty,notes",
              )
              .in("session_id", sessionIds)
              .order("course_number")
              .returns<ExportTargetDefinitionRow[]>(),
          ]);

        if (coursesResult.error) throw coursesResult.error;
        if (missesResult.error) throw missesResult.error;
        if (definitionsResult.error) throw definitionsResult.error;

        exportCourses = coursesResult.data || [];
        exportMisses = missesResult.data || [];
        exportTargetDefinitions = definitionsResult.data || [];
      }

      const { exportFileName, exportUserDataToExcel } =
        await import("@/lib/export/exportUserData");
      exportUserDataToExcel(
        {
          sessions: exportSessions,
          courses: exportCourses,
          misses: exportMisses,
          targetDefinitions: exportTargetDefinitions,
        },
        exportFileName(),
      );
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : "Could not export your data. Please try again.",
      );
    } finally {
      setExporting(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const groups = useMemo<SessionGroup[]>(() => {
    const sortedSessions = sessions.slice().sort(sortNewestFirst);
    const competitions = sortedSessions.filter(
      (session) =>
        session.session_type === "Competition" &&
        !isResultOnly(session, missCounts),
    );
    const training = sortedSessions.filter(
      (session) =>
        session.session_type !== "Competition" &&
        !isResultOnly(session, missCounts),
    );
    const resultOnly = sortedSessions.filter((session) =>
      isResultOnly(session, missCounts),
    );
    return [
      {
        title: "Competitions",
        description:
          "Competition shooting logs with courses, misses or scoring context.",
        sessions: competitions,
      },
      {
        title: "Result only",
        description:
          "Result only score entries without logged courses or misses.",
        sessions: resultOnly,
      },
      {
        title: "Training",
        description:
          "Training shooting logs for reviewing missed-target patterns.",
        sessions: training,
      },
    ].filter((group) => group.sessions.length > 0);
  }, [sessions, missCounts]);

  return (
    <main>
      <div className="heroCard dashboardHero">
        <p className="eyebrow">Shooter workspace</p>
        <h2>Dashboard</h2>
        <p className="dashboardHeroCopy">
          Create shooting logs, capture result only entries, and review
          competition trends.
        </p>
        <div className="dashboardHeroHelp">
          <p className="small muted">
            <strong>New shooting log:</strong> Log misses and analyze target
            patterns.
          </p>
          <p className="small muted">
            <strong>Add result only:</strong> Track score vs winning score
            without logging misses.
          </p>
          <p className="small muted">
            <strong>Import from Leirdue.net:</strong> Find old competition
            results and review before saving.
          </p>
        </div>
        <div className="dashboardActions">
          <Link href="/sessions/new" className="button">
            New shooting log
          </Link>
          <Link href="/results/new" className="button secondary">
            Add result only
          </Link>
          <Link href="/import/leirdue" className="button secondary">
            Import from Leirdue.net
          </Link>
          <Link href="/fitasc" className="button secondary">
            FITASC schemes
          </Link>
          <Link href="/stats" className="button secondary">
            Stats
          </Link>
          <button
            className="secondary"
            onClick={exportMyData}
            disabled={exporting || loading}
          >
            {exporting ? "Exporting..." : "Export my data"}
          </button>
          <button className="secondary" onClick={load}>
            Refresh
          </button>
          <button className="danger" onClick={logout}>
            Logout
          </button>
        </div>
        {exportError && <div className="error">{exportError}</div>}
      </div>

      <div className="card">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Shooting log</p>
            <h2>Shooting logs and results</h2>
          </div>
          {!loading && sessions.length > 0 && (
            <span className="pill">
              <strong>{sessions.length}</strong> total
            </span>
          )}
        </div>
        {loading ? (
          <p>Loading...</p>
        ) : sessions.length === 0 ? (
          <div className="emptyState">
            No shooting logs or result only entries yet. Create your first
            training or competition log to start tracking.
          </div>
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
                <SessionCard
                  key={session.id}
                  session={session}
                  missCounts={missCounts}
                />
              ))}
            </section>
          ))
        )}
      </div>
    </main>
  );
}
