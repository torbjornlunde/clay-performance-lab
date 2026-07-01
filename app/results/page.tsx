"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { countMissesBySession, scoreFromMisses } from "@/lib/misses/scoring";
import { supabase } from "@/lib/supabase/client";
import { isQuickScoreNotes, parseQuickScoreMetadata } from "@/lib/quick-score/metadata";

type ResultFilter = "all" | "competition" | "imported" | "manual" | "draft";

type SessionRow = {
  id: string;
  name: string;
  discipline: string;
  session_type: string;
  shooting_format: string | null;
  course_count: number | null;
  total_targets: number | null;
  created_at: string;
  competition_date: string | null;
  leirdue_result_url: string | null;
  own_score: number | null;
  winning_score: number | null;
  shooting_ground: string | null;
  notes: string | null;
};

type MissRow = { session_id: string; missed_target: string | null };
type CourseRow = { session_id: string };

type ResultSource = "Quick score" | "Quick result" | "Detailed log" | "Leirdue.net import" | "Manual";

const filters: Array<{ value: ResultFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "competition", label: "Competition" },
  { value: "imported", label: "Imported" },
  { value: "manual", label: "Manual" },
  { value: "draft", label: "Draft/incomplete" },
];

function isUsableNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function sortableDate(session: SessionRow) {
  return new Date(session.competition_date || session.created_at).getTime();
}

function isImported(session: SessionRow) {
  return Boolean(session.leirdue_result_url || session.notes?.toLowerCase().includes("source: leirdue_net") || session.notes?.toLowerCase().includes("leirdue import"));
}

function importDetail(session: SessionRow, key: string) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = session.notes?.match(new RegExp(`(?:^|\\. )${escapedKey}:\\s*([\\s\\S]*?)(?=\\. [a-z_]+:|$)`, "i"));
  return match?.[1]?.trim() || null;
}

function importedAt(session: SessionRow) {
  return importDetail(session, "imported_at");
}

function hasScore(session: SessionRow) {
  return isUsableNumber(session.own_score) || isUsableNumber(session.total_targets);
}

function scoreUsed(session: SessionRow, missCounts: Record<string, number>) {
  if (isUsableNumber(session.own_score)) return session.own_score;
  if (isUsableNumber(session.total_targets)) return scoreFromMisses(session.total_targets, missCounts[session.id] || 0);
  return null;
}

function isDetailedLog(session: SessionRow, missCounts: Record<string, number>, courseCounts: Record<string, number>) {
  return Boolean(missCounts[session.id] || courseCounts[session.id] || session.course_count);
}

function isDraftOrIncomplete(session: SessionRow, missCounts: Record<string, number>, courseCounts: Record<string, number>) {
  return !session.competition_date || !hasScore(session) || (isDetailedLog(session, missCounts, courseCounts) && !missCounts[session.id] && !isUsableNumber(session.own_score));
}

function resultSource(session: SessionRow, missCounts: Record<string, number>, courseCounts: Record<string, number>): ResultSource {
  if (isImported(session)) return "Leirdue.net import";
  if (isQuickScoreNotes(session.notes)) return "Quick score";
  if (isDetailedLog(session, missCounts, courseCounts)) return "Detailed log";
  if (isUsableNumber(session.own_score) && isUsableNumber(session.winning_score)) return "Quick result";
  return "Manual";
}

function isCompetitionResult(session: SessionRow) {
  if (session.session_type === "Training") return false;
  return session.session_type === "Competition" || hasScore(session) || isImported(session);
}

function statusBadges(session: SessionRow, missCounts: Record<string, number>, courseCounts: Record<string, number>) {
  const badges: string[] = ["Competition"];
  if (isImported(session)) badges.push("Imported");
  if (!hasScore(session)) badges.push("Needs result");
  else if (isDetailedLog(session, missCounts, courseCounts) && !missCounts[session.id] && !isUsableNumber(session.own_score)) badges.push("Setup incomplete");
  return Array.from(new Set(badges));
}

function resultState(session: SessionRow, missCounts: Record<string, number>, courseCounts: Record<string, number>) {
  if (!hasScore(session)) return "Needs result";
  if (isDetailedLog(session, missCounts, courseCounts) && !missCounts[session.id] && !isUsableNumber(session.own_score)) return "Setup incomplete";
  return "Competition";
}

function resultMatchesFilter(session: SessionRow, filter: ResultFilter, missCounts: Record<string, number>, courseCounts: Record<string, number>) {
  const source = resultSource(session, missCounts, courseCounts);
  if (filter === "all") return true;
  if (filter === "competition") return session.session_type === "Competition" && !isImported(session);
  if (filter === "imported") return isImported(session);
  if (filter === "manual") return source === "Manual" || source === "Quick result" || source === "Quick score";
  if (filter === "draft") return isDraftOrIncomplete(session, missCounts, courseCounts);
  return true;
}

export default function ResultsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [missCounts, setMissCounts] = useState<Record<string, number>>({});
  const [courseCounts, setCourseCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<ResultFilter>("all");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setErr("");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      router.push("/login");
      return;
    }

    const [{ data: sessionData, error: sessionError }, { data: misses }, { data: courses }] = await Promise.all([
      supabase.from("sessions").select("id,name,discipline,session_type,shooting_format,course_count,total_targets,created_at,competition_date,leirdue_result_url,own_score,winning_score,shooting_ground,notes").order("created_at", { ascending: false }).returns<SessionRow[]>(),
      supabase.from("misses").select("session_id,missed_target").returns<MissRow[]>(),
      supabase.from("session_courses").select("session_id").returns<CourseRow[]>(),
    ]);

    if (sessionError) {
      setErr(sessionError.message);
      setLoading(false);
      return;
    }

    setMissCounts(countMissesBySession(misses || []));
    setCourseCounts((courses || []).reduce<Record<string, number>>((acc, course) => {
      acc[course.session_id] = (acc[course.session_id] || 0) + 1;
      return acc;
    }, {}));
    setSessions((sessionData || []).filter(isCompetitionResult));
    setLoading(false);
  }

  async function deleteResult(session: SessionRow) {
    const confirmed = window.confirm("Delete this result? This cannot be undone.");
    if (!confirmed) return;

    setDeletingId(session.id);
    setErr("");
    const { error } = await supabase.from("sessions").delete().eq("id", session.id);
    setDeletingId(null);

    if (error) {
      setErr(error.message);
      return;
    }

    setSessions((items) => items.filter((item) => item.id !== session.id));
    setMissCounts(({ [session.id]: _removed, ...rest }) => rest);
    setCourseCounts(({ [session.id]: _removed, ...rest }) => rest);
  }

  const visibleResults = useMemo(
    () => sessions
      .filter((session) => resultMatchesFilter(session, filter, missCounts, courseCounts))
      .sort((a, b) => sortableDate(b) - sortableDate(a)),
    [sessions, filter, missCounts, courseCounts],
  );

  return (
    <main>
      <div className="heroCard">
        <div>
          <p className="eyebrow">Results history</p>
          <h2>Manage competition results</h2>
          <p>Open, review, and delete your saved quick results, detailed competition logs, manual entries, and Leirdue.net imports.</p>
        </div>
        <div className="btns heroActions">
          <Link href="/results/new" className="button">Register competition</Link>
          <Link href="/import/leirdue" className="button secondary">Import from Leirdue.net</Link>
        </div>
      </div>

      <div className="card">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Archive</p>
            <h2>Saved results</h2>
          </div>
          <div className="sectionHeaderActions">
            <Link href="/stats" className="button secondary smallButton">Performance</Link>
          </div>
        </div>

        <div className="filterBar" aria-label="Result filters">
          {filters.map((item) => (
            <button
              className={`button secondary smallButton filterButton ${filter === item.value ? "activeFilter" : ""}`}
              key={item.value}
              type="button"
              onClick={() => setFilter(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {err && <div className="error">{err}</div>}
        {loading ? (
          <p>Loading...</p>
        ) : visibleResults.length === 0 ? (
          <div className="emptyState compactEmptyState">
            <p>
              {sessions.length === 0
                ? "No competition results yet. Register a competition first, or import from Leirdue.net if the result is already published."
                : "No results match this filter."}
            </p>
            <div className="btns compactEmptyActions">
              <Link href="/results/new" className="button smallButton">Register competition</Link>
              {sessions.length === 0 && <Link href="/import/leirdue" className="button secondary smallButton">Import from Leirdue.net</Link>}
            </div>
          </div>
        ) : (
          <div className="scoreSheetArchiveList">
            {visibleResults.map((session) => {
              const source = resultSource(session, missCounts, courseCounts);
              const score = scoreUsed(session, missCounts);
              const badges = statusBadges(session, missCounts, courseCounts);
              const importedAtValue = importedAt(session);
              return (
                <div className="statListItem trainingScoreSheetArchiveItem" key={session.id}>
                  <div>
                    <strong>{session.name}</strong>
                    <div className="small muted">
                      {formatDate(session.competition_date || session.created_at)}
                      {session.shooting_ground ? ` · ${session.shooting_ground}` : ""}
                      {` · ${session.discipline}`}
                    </div>
                    <div className="small muted">
                      Score {score === null ? "-" : score} / {session.total_targets ?? "-"}
                      {isUsableNumber(session.winning_score) ? ` · Winning score ${session.winning_score}` : ""}
                      {` · ${resultState(session, missCounts, courseCounts)}`}
                    </div>
                    <div className="small muted">Technical source: {source}</div>
                    {parseQuickScoreMetadata(session.notes) && (
                      <div className="small muted">
                        Order {parseQuickScoreMetadata(session.notes)?.courseOrder.join(" → ")} · Misses {parseQuickScoreMetadata(session.notes)?.totalMisses}
                      </div>
                    )}
                    <div className="small muted">Created {formatDateTime(session.created_at)}</div>
                    {source === "Leirdue.net import" && (
                      <div className="small muted">
                        Source: Leirdue.net
                        {session.leirdue_result_url ? ` · URL saved` : ""}
                        {importedAtValue ? ` · Imported ${formatDateTime(importedAtValue)}` : ""}
                      </div>
                    )}
                    <div className="sheetStatusBadges">
                      {badges.map((badge, index) => <span className={index === 0 ? "badge badgeBlue" : "badge"} key={badge}>{badge}</span>)}
                    </div>
                    <div className="btns archiveActions">
                      <Link className="button secondary smallButton" href={`/sessions/${session.id}`}>Open</Link>
                      <Link className="button secondary smallButton" href={`/sessions/${session.id}/edit`}>Edit</Link>
                      {session.leirdue_result_url && <a className="button secondary smallButton" href={session.leirdue_result_url} target="_blank" rel="noreferrer">Open Leirdue.net</a>}
                      <button className="button danger smallButton" type="button" disabled={deletingId === session.id} onClick={() => deleteResult(session)}>
                        {deletingId === session.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
                  <span className="statPercent">{score === null ? "No score" : `${score}/${session.total_targets ?? "?"}`}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
