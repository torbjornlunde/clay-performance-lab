"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buildPeriodCoachReport, type CoachReportPeriodSession } from "@/lib/analysis/coachReportPeriod";
import { recordAnalyticsEvent } from "@/lib/analytics";
import { supabase } from "@/lib/supabase/client";

type MissRow = { id?: string; session_id: string; course_number: number | null; target_position?: number | null; target_number: number | null; missed_target?: string | null; main_reason?: string | null; where_miss?: string | null; created_at?: string | null };
type NoteRow = { session_id: string; note_scope: "session" | "post"; post_number?: number | null; body?: string | null };

function localDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function defaultFromDate() { const date = new Date(); date.setMonth(date.getMonth() - 1); return localDateInput(date); }
function defaultToDate() { return localDateInput(new Date()); }
function sessionDate(session: CoachReportPeriodSession) { return String(session.competition_date || session.created_at || "").slice(0, 10); }
function inRange(session: CoachReportPeriodSession, from: string, to: string) { const date = sessionDate(session); return (!from || date >= from) && (!to || date <= to); }
function scoreLabel(session: CoachReportPeriodSession, misses: MissRow[]) {
  const total = typeof session.total_targets === "number" ? session.total_targets : null;
  const score = typeof session.own_score === "number" ? session.own_score : total !== null ? Math.max(0, total - misses.length) : null;
  if (score === null && total === null) return "Score not recorded";
  if (score === null) return `Total targets ${total}`;
  return `Score ${score}${total ? ` / ${total}` : ""}`;
}
function typeLabel(session: CoachReportPeriodSession) { return String(session.session_type || "").toLowerCase() === "competition" ? "Competition" : "Training"; }

export default function CoachReportPeriodPage() {
  const router = useRouter();
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);
  const [sessions, setSessions] = useState<CoachReportPeriodSession[]>([]);
  const [misses, setMisses] = useState<MissRow[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [includeNotesContext, setIncludeNotesContext] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [previewInput, setPreviewInput] = useState<{ fromDate: string; toDate: string; selectedIds: string[]; includeNotesContext: boolean } | null>(null);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) { router.push("/login"); return; }
    const { data: sessionRows } = await supabase
      .from("sessions")
      .select("id,name,discipline,session_type,own_score,total_targets,created_at,competition_date,shooting_ground,user_id")
      .eq("user_id", authData.user.id)
      .order("competition_date", { ascending: false, nullsFirst: false });
    const rows = (sessionRows || []) as CoachReportPeriodSession[];
    const ids = rows.map((session) => session.id);
    const [{ data: missRows }, { data: noteRows }] = ids.length ? await Promise.all([
      supabase.from("misses").select("id,session_id,course_number,target_position,target_number,missed_target,main_reason,where_miss,created_at").in("session_id", ids),
      supabase.from("private_session_notes").select("session_id,note_scope,post_number,body").in("session_id", ids),
    ]) : [{ data: [] }, { data: [] }];
    setSessions(rows);
    setMisses((missRows || []) as MissRow[]);
    const privateNotes = ((noteRows || []) as NoteRow[]).filter((note) => String(note.body || "").trim());
    setNotes(privateNotes);
    const visible = rows.filter((session) => inRange(session, fromDate, toDate)).map((session) => session.id);
    setSelectedIds(new Set(visible));
    const hasNotes = privateNotes.some((note) => visible.includes(note.session_id));
    setIncludeNotesContext(hasNotes);
    setPreviewInput({ fromDate, toDate, selectedIds: visible, includeNotesContext: hasNotes });
    setLoading(false);
  }

  const visibleSessions = useMemo(() => sessions.filter((session) => inRange(session, fromDate, toDate)).sort((a, b) => sessionDate(b).localeCompare(sessionDate(a))), [sessions, fromDate, toDate]);
  useEffect(() => {
    setSelectedIds(new Set(visibleSessions.map((session) => session.id)));
  }, [fromDate, toDate, sessions.length]);
  const selectedSessions = visibleSessions.filter((session) => selectedIds.has(session.id));
  const previewSelectedIds = new Set(previewInput?.selectedIds || [...selectedIds]);
  const previewSessions = sessions.filter((session) => previewSelectedIds.has(session.id)).sort((a, b) => sessionDate(b).localeCompare(sessionDate(a)));
  const notesForSelected = notes.filter((note) => selectedIds.has(note.session_id));
  useEffect(() => { if (notesForSelected.length > 0) setIncludeNotesContext(true); }, [notesForSelected.length]);
  const missesBySession = useMemo(() => Object.fromEntries(previewSessions.map((session) => [session.id, misses.filter((miss) => miss.session_id === session.id)])), [previewSessions, misses]);
  const privateNotesBySession = useMemo(() => Object.fromEntries(previewSessions.map((session) => [session.id, notes.filter((note) => note.session_id === session.id)])), [previewSessions, notes]);
  const report = useMemo(() => buildPeriodCoachReport({ fromDate: previewInput?.fromDate || fromDate, toDate: previewInput?.toDate || toDate, sessions: previewSessions, missesBySession, privateNotesBySession, includeNotesContext: previewInput?.includeNotesContext ?? includeNotesContext }), [previewInput, fromDate, toDate, previewSessions, missesBySession, privateNotesBySession, includeNotesContext]);
  const previewNeedsUpdate = !previewInput || previewInput.fromDate !== fromDate || previewInput.toDate !== toDate || previewInput.includeNotesContext !== includeNotesContext || previewInput.selectedIds.length !== selectedIds.size || previewInput.selectedIds.some((id) => !selectedIds.has(id));
  function updatePreview() { setCopyStatus(""); setPreviewInput({ fromDate, toDate, selectedIds: [...selectedIds], includeNotesContext }); }

  useEffect(() => {
    if (loading) return;
    void recordAnalyticsEvent(supabase, "coach_report_period_preview_opened", { route: "/coach-report", feature: "coach_report", metadata: { reportType: "period", selectedSessionCount: report.selectedSessionCount, trainingCount: report.trainingCount, competitionCount: report.competitionCount, hasNotesContext: report.hasNotesContext, periodDays: report.periodDays } });
  }, [loading, previewInput?.fromDate, previewInput?.toDate]);

  async function copyReport() {
    setCopyStatus("");
    try {
      await navigator.clipboard.writeText(report.plainText);
      setCopyStatus("Copied");
      void recordAnalyticsEvent(supabase, "coach_report_period_copied", { route: "/coach-report", feature: "coach_report", metadata: { reportType: "period", selectedSessionCount: report.selectedSessionCount, trainingCount: report.trainingCount, competitionCount: report.competitionCount, hasNotesContext: report.hasNotesContext, periodDays: report.periodDays } });
    } catch {
      setCopyStatus("Copy failed. Select the report text and copy it manually.");
    }
  }

  if (loading) return <main className="coachReportPage"><section className="card">Loading coach report...</section></main>;
  return <main className="coachReportPage">
    <section className="card coachReportHero">
      <p className="small muted"><Link href="/dashboard">← Back to dashboard</Link></p>
      <h1>Coach report</h1>
      <p className="muted">Choose report settings, select sessions, update the preview, then review the visible report before copying it.</p>
      <p className="small muted">This is a training-support summary, not a replacement for a coach watching you shoot.</p>
      <div className="coachReportDateGrid">
        <label>From date<input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
        <label>To date<input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
      </div>
      {notesForSelected.length > 0 && <div className="analysisPrivateNotesControl">
        <label className="checkboxRow"><input type="checkbox" checked={includeNotesContext} onChange={(event) => setIncludeNotesContext(event.target.checked)} /><span>Include notes-based context</span></label>
        <p className="small muted">Only summarized note themes are included. Raw private notes are not shown.</p>
      </div>}
    </section>
    <section className="card coachReportSessionList"><h2>Sessions in range</h2>{visibleSessions.length === 0 ? <p>No training or competition sessions found in this date range.</p> : visibleSessions.map((session) => {
      const sessionMisses = misses.filter((miss) => miss.session_id === session.id);
      return <label key={session.id} className="coachReportSessionCard"><input type="checkbox" checked={selectedIds.has(session.id)} onChange={(event) => setSelectedIds((current) => { const next = new Set(current); if (event.target.checked) next.add(session.id); else next.delete(session.id); return next; })} /><span><strong>{sessionDate(session)} — {session.name || "Untitled session"}</strong><span className="small muted">{session.discipline || "Discipline not recorded"} · {typeLabel(session)} · {scoreLabel(session, sessionMisses)}{session.shooting_ground ? ` · ${session.shooting_ground}` : ""}</span></span></label>;
    })}</section>
    <section className="card"><div className="btns"><button type="button" onClick={updatePreview} disabled={selectedSessions.length === 0}>Update report preview</button>{previewNeedsUpdate && <span className="warningInline">Report preview needs update</span>}</div></section>
    <article className="card coachReportPreview" aria-label="Coach report plain-text preview"><div className="coachReportPreviewHeader"><div><p className="eyebrow">Basic coach report</p><h2>Report preview</h2><p className="small muted">Review the report below before copying it.</p></div><div className="btns"><button type="button" onClick={copyReport} disabled={report.selectedSessionCount === 0}>Copy visible report</button>{copyStatus && <span className={copyStatus === "Copied" ? "successInline" : "errorInline"}>{copyStatus}</span>}</div></div><div className="coachReportSummaryGrid"><span>{report.selectedSessionCount} sessions</span><span>{previewInput?.fromDate || fromDate} to {previewInput?.toDate || toDate}</span><span>{report.trainingCount} training</span><span>{report.competitionCount} competition</span><span>Notes context: {report.hasNotesContext ? "yes" : "no"}</span><span>Data quality: {report.dataQuality}</span></div>{report.sections.map((section) => <section key={section.title} className="coachReportSection"><h2>{section.title}</h2>{section.items.map((item) => <p key={item}>• {item}</p>)}</section>)}</article>
  </main>;
}
