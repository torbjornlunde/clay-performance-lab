"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buildPeriodCoachReport, type CoachReportPeriodSession } from "@/lib/analysis/coachReportPeriod";
import { recordAnalyticsEvent } from "@/lib/analytics";
import { supabase } from "@/lib/supabase/client";

type MissRow = { id?: string; session_id: string; course_number: number | null; target_position?: number | null; target_number: number | null; missed_target?: string | null; main_reason?: string | null; where_miss?: string | null; created_at?: string | null };
type NoteRow = { session_id: string; note_scope: "session" | "post"; post_number?: number | null; body?: string | null };
type ScorecardImportRow = { session_id: string; reviewed_total_targets: number; reviewed_hits: number; reviewed_misses: number; inserted_misses?: number | null; skipped_duplicates?: number | null; created_at?: string | null };
type LeirdueRow = { event_id?: string | null; liste_id?: string | null; normalized_name?: string | null; original_name?: string | null; club?: string | null; placement?: number | null; score?: number | null; own_score?: number | null; total_targets?: number | null; winning_score?: number | null; discipline?: string | null; event_date?: string | null; event_title?: string | null; organizer?: string | null; source_url?: string | null; validation_status?: string | null };
type AiReport = { reportText: string; sections: string[] };

const AI_SECTION_TITLES = ["Coach summary", "Performance context", "Main findings", "Discipline-specific notes", "What to train next", "Data quality"];
function parseAiReportCards(text: string) {
  const cards = AI_SECTION_TITLES.map((title) => ({ title, items: [] as string[] }));
  let current = cards[0];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const heading = AI_SECTION_TITLES.find((title) => line.toLowerCase().replace(/:$/, "") === title.toLowerCase());
    if (heading) { current = cards.find((card) => card.title === heading) || current; continue; }
    current.items.push(line.replace(/^[-•*]\s*/, ""));
  }
  return cards.filter((card) => card.items.length > 0);
}

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
  const [scorecardImports, setScorecardImports] = useState<ScorecardImportRow[]>([]);
  const [leirdueRows, setLeirdueRows] = useState<LeirdueRow[]>([]);
  const [leirdueStatus, setLeirdueStatus] = useState<"idle" | "available" | "unavailable">("idle");
  const [leirdueError, setLeirdueError] = useState("");
  const [aiReport, setAiReport] = useState<AiReport | null>(null);
  const [aiStatus, setAiStatus] = useState("");
  const [aiError, setAiError] = useState("");
  const [sessionsOpen, setSessionsOpen] = useState(false);
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
      .select("id,name,discipline,session_type,own_score,total_targets,winning_score,created_at,competition_date,shooting_ground,user_id,leirdue_result_url")
      .eq("user_id", authData.user.id)
      .order("competition_date", { ascending: false, nullsFirst: false });
    const rows = (sessionRows || []) as CoachReportPeriodSession[];
    const ids = rows.map((session) => session.id);
    const [{ data: missRows }, { data: noteRows }, { data: importRows }] = ids.length ? await Promise.all([
      supabase.from("misses").select("id,session_id,course_number,target_position,target_number,missed_target,main_reason,where_miss,created_at").in("session_id", ids),
      supabase.from("private_session_notes").select("session_id,note_scope,post_number,body").in("session_id", ids),
      supabase.from("scorecard_imports").select("session_id,reviewed_total_targets,reviewed_hits,reviewed_misses,inserted_misses,skipped_duplicates,created_at").in("session_id", ids).order("created_at", { ascending: false }),
    ]) : [{ data: [] }, { data: [] }, { data: [] }];
    setSessions(rows);
    setMisses((missRows || []) as MissRow[]);
    setScorecardImports((importRows || []) as ScorecardImportRow[]);
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
  const scorecardImportsBySession = useMemo(() => Object.fromEntries(previewSessions.map((session) => [session.id, scorecardImports.find((row) => row.session_id === session.id) || null])), [previewSessions, scorecardImports]);
  const report = useMemo(() => buildPeriodCoachReport({ fromDate: previewInput?.fromDate || fromDate, toDate: previewInput?.toDate || toDate, sessions: previewSessions, missesBySession, scorecardImportsBySession, privateNotesBySession, includeNotesContext: previewInput?.includeNotesContext ?? includeNotesContext, leirdueRows }), [previewInput, fromDate, toDate, previewSessions, missesBySession, scorecardImportsBySession, privateNotesBySession, includeNotesContext, leirdueRows]);
  const currentMissesBySession = useMemo(() => Object.fromEntries(selectedSessions.map((session) => [session.id, misses.filter((miss) => miss.session_id === session.id)])), [selectedSessions, misses]);
  const currentPrivateNotesBySession = useMemo(() => Object.fromEntries(selectedSessions.map((session) => [session.id, notes.filter((note) => note.session_id === session.id)])), [selectedSessions, notes]);
  const currentScorecardImportsBySession = useMemo(() => Object.fromEntries(selectedSessions.map((session) => [session.id, scorecardImports.find((row) => row.session_id === session.id) || null])), [selectedSessions, scorecardImports]);
  const aiReportCards = aiReport ? parseAiReportCards(aiReport.reportText) : [];
  const evidenceSummaryItems = [`Sessions used: ${report.selectedSessionCount}`, `Disciplines: ${report.evidence.disciplineGroups.map((group) => group.discipline).join(", ") || "none"}`, `Matched Leirdue events: ${report.evidence.leirdueFieldContexts.length}`, `Scorecard sessions: ${report.evidence.sessionsWithScorecardImportEvidence.length}`, `Detailed miss rows: ${report.evidence.detailedMissCount}`, `Notes context: ${report.hasNotesContext ? "yes" : "no"}`, `Data quality: ${report.dataQuality}`];
  const previewNeedsUpdate = !previewInput || previewInput.fromDate !== fromDate || previewInput.toDate !== toDate || previewInput.includeNotesContext !== includeNotesContext || previewInput.selectedIds.length !== selectedIds.size || previewInput.selectedIds.some((id) => !selectedIds.has(id));
  async function fetchLeirdueContextFor(reportSessions: CoachReportPeriodSession[]) {
    const competitions = reportSessions.filter((session) => typeLabel(session) === "Competition");
    if (competitions.length === 0) { setLeirdueRows([]); setLeirdueStatus("available"); setLeirdueError(""); return [] as LeirdueRow[]; }
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) { setLeirdueStatus("unavailable"); setLeirdueError("Sign in again to load Leirdue field context."); return [] as LeirdueRow[]; }
    const response = await fetch("/api/coach-report/leirdue-context", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ sessions: competitions }) });
    const json = await response.json();
    const rows = Array.isArray(json.rows) ? json.rows as LeirdueRow[] : [];
    setLeirdueRows(rows);
    setLeirdueStatus(json.status === "available" ? "available" : "unavailable");
    setLeirdueError(Array.isArray(json.errors) ? json.errors.join(" ") : "");
    return rows;
  }
  async function updatePreview() { setCopyStatus(""); setAiReport(null); setAiError(""); const rows = await fetchLeirdueContextFor(selectedSessions); setPreviewInput({ fromDate, toDate, selectedIds: [...selectedIds], includeNotesContext }); return rows; }

  useEffect(() => {
    if (loading) return;
    void recordAnalyticsEvent(supabase, "coach_report_period_preview_opened", { route: "/coach-report", feature: "coach_report", metadata: { reportType: aiReport ? "ai_period" : "period", selectedSessionCount: report.selectedSessionCount, trainingCount: report.trainingCount, competitionCount: report.competitionCount, hasNotesContext: report.hasNotesContext, periodDays: report.periodDays } });
  }, [loading, previewInput?.fromDate, previewInput?.toDate]);

  async function copyReport() {
    setCopyStatus("");
    try {
      await navigator.clipboard.writeText(aiReport?.reportText || `Deterministic evidence preview\n\n${report.plainText}`);
      setCopyStatus("Copied");
      void recordAnalyticsEvent(supabase, "coach_report_copied", { route: "/coach-report", feature: "coach_report", metadata: { reportType: aiReport ? "ai_period" : "period", selectedSessionCount: report.selectedSessionCount, trainingCount: report.trainingCount, competitionCount: report.competitionCount, hasNotesContext: report.hasNotesContext, periodDays: report.periodDays } });
    } catch {
      setCopyStatus("Copy failed. Select the report text and copy it manually.");
    }
  }

  async function generateAiReport() {
    setAiStatus("Generating AI coach report...");
    setAiError("");
    setAiReport(null);
    const freshLeirdueRows = await fetchLeirdueContextFor(selectedSessions);
    setPreviewInput({ fromDate, toDate, selectedIds: [...selectedIds], includeNotesContext });
    const currentReport = buildPeriodCoachReport({ fromDate, toDate, sessions: selectedSessions, missesBySession: currentMissesBySession, scorecardImportsBySession: currentScorecardImportsBySession, privateNotesBySession: currentPrivateNotesBySession, includeNotesContext, leirdueRows: freshLeirdueRows });
    const safeMetadata = { reportType: "ai_period", selectedSessionCount: selectedSessions.length, trainingCount: selectedSessions.filter((session) => typeLabel(session) === "Training").length, competitionCount: selectedSessions.filter((session) => typeLabel(session) === "Competition").length, disciplineCount: new Set(selectedSessions.map((session) => session.discipline || "Unknown")).size, hasLeirdueContext: currentReport.evidence.leirdueFieldContexts.length > 0, hasNotesContext: currentReport.hasNotesContext, dataQuality: currentReport.dataQuality };
    void recordAnalyticsEvent(supabase, "coach_report_ai_generate_clicked", { route: "/coach-report", feature: "coach_report", metadata: safeMetadata });
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("You must be signed in to generate an AI coach report.");
      const response = await fetch("/api/coach-report/generate", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ evidencePacket: currentReport.aiEvidencePacket }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || "AI coach report failed.");
      setAiReport({ reportText: json.reportText, sections: json.sections || [] });
      setAiStatus("AI coach report ready.");
      void recordAnalyticsEvent(supabase, "coach_report_ai_generated", { route: "/coach-report", feature: "coach_report", metadata: safeMetadata });
    } catch (error: any) {
      setAiStatus("");
      setAiError(error?.message || "AI coach report failed. The deterministic evidence preview is still available.");
      void recordAnalyticsEvent(supabase, "coach_report_ai_failed", { route: "/coach-report", feature: "coach_report", metadata: safeMetadata });
    }
  }

  const selectedSummary = `${selectedSessions.length} selected · ${selectedSessions.filter((session) => typeLabel(session) === "Training").length} training · ${selectedSessions.filter((session) => typeLabel(session) === "Competition").length} competition`;

  if (loading) return <main className="coachReportPage"><section className="card">Loading coach report...</section></main>;
  return <main className="coachReportPage">
    <section className="card coachReportHero">
      <p className="small muted"><Link href="/dashboard">← Back to dashboard</Link></p>
      <div className="coachReportHeroHeader"><div><h1>Coach report</h1><p className="muted">{fromDate} to {toDate}</p></div><button type="button" onClick={generateAiReport} disabled={selectedSessions.length === 0 || aiStatus === "Generating AI coach report..."}>Generate AI coach report</button></div>
      <p className="small muted">Private AI preview based on deterministic evidence. This is training support, not a replacement for a coach watching you shoot.</p>
      <div className="coachReportDateGrid"><label>From date<input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label><label>To date<input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label></div>
      {notesForSelected.length > 0 && <div className="analysisPrivateNotesControl"><label className="checkboxRow"><input type="checkbox" checked={includeNotesContext} onChange={(event) => setIncludeNotesContext(event.target.checked)} /><span>Include notes-based context</span></label><p className="small muted">Only summarized note themes are included. Raw private notes are not shown.</p></div>}
      <div className="btns"><button className="button secondary" type="button" onClick={() => void updatePreview()} disabled={selectedSessions.length === 0}>Update evidence preview</button>{previewNeedsUpdate && <span className="warningInline">Evidence preview needs update</span>}</div>
      {aiStatus && <p className="successInline">{aiStatus}</p>}{aiError && <p className="errorInline">{aiError}</p>}{leirdueStatus === "unavailable" && leirdueError && <p className="warningInline">Leirdue context unavailable: {leirdueError}</p>}
    </section>
    <section className="card coachReportSessionList"><button type="button" className="coachReportAccordionButton" aria-expanded={sessionsOpen} onClick={() => setSessionsOpen((open) => !open)}><span><strong>Selected sessions</strong><small>{selectedSummary}</small></span><span>{sessionsOpen ? "Hide" : "Show"}</span></button>{sessionsOpen && <div className="coachReportSessionPanel"><div className="btns"><button type="button" className="button secondary" onClick={() => setSelectedIds(new Set(visibleSessions.map((session) => session.id)))}>Select all</button><button type="button" className="button secondary" onClick={() => setSelectedIds(new Set())}>Clear all</button></div>{visibleSessions.length === 0 ? <p>No training or competition sessions found in this date range.</p> : visibleSessions.map((session) => { const sessionMisses = misses.filter((miss) => miss.session_id === session.id); return <label key={session.id} className="coachReportSessionCard"><input type="checkbox" checked={selectedIds.has(session.id)} onChange={(event) => setSelectedIds((current) => { const next = new Set(current); if (event.target.checked) next.add(session.id); else next.delete(session.id); return next; })} /><span><strong>{sessionDate(session)} — {session.name || "Untitled session"}</strong><span className="small muted">{session.discipline || "Discipline not recorded"} · {typeLabel(session)} · {scoreLabel(session, sessionMisses)}{session.shooting_ground ? ` · ${session.shooting_ground}` : ""}</span></span></label>; })}</div>}</section>
    <article className="card coachReportPreview" aria-label="Coach report plain-text preview"><div className="coachReportPreviewHeader"><div><p className="eyebrow">Private coach report preview</p><h2>{aiReport ? "AI coach report" : "Deterministic evidence preview"}</h2><p className="small muted">Copy only what is visible here. AI failures keep this evidence preview available.</p></div><div className="btns"><button type="button" onClick={copyReport} disabled={report.selectedSessionCount === 0}>Copy visible report</button>{copyStatus && <span className={copyStatus === "Copied" ? "successInline" : "errorInline"}>{copyStatus}</span>}</div></div><div className="coachReportSummaryGrid"><span>{report.selectedSessionCount} sessions</span><span>{previewInput?.fromDate || fromDate} to {previewInput?.toDate || toDate}</span><span>{report.trainingCount} training</span><span>{report.competitionCount} competition</span><span>Leirdue context: {report.evidence.leirdueFieldContexts.length ? "yes" : "no"}</span><span>Data quality: {report.dataQuality}</span></div>{aiReport ? <div className="coachReportAiCards">{aiReportCards.map((card) => <section key={card.title} className="coachReportAiCard"><h3>{card.title}</h3>{card.items.map((item) => <p key={item}>• {item}</p>)}</section>)}</div> : report.sections.filter((section) => ["Coach takeaway", "Performance context", "Discipline-specific notes", "What to test next", "Data quality and what to log next"].includes(section.title)).map((section) => <section key={section.title} className="coachReportSection"><h2>{section.title}</h2>{section.items.slice(0, 4).map((item) => <p key={item}>• {item}</p>)}</section>)}<details><summary>Leirdue field comparison</summary>{report.evidence.leirdueFieldContexts.length ? report.evidence.leirdueFieldContexts.map((field) => <p key={field.sessionId}>{field.eventTitle}: {field.fieldSize} shooters · placement {field.placement ?? "?"} · median {field.medianScore ?? "?"} · {field.competitionLevel}</p>) : <p>No matched Leirdue field context.</p>}</details><details><summary>Evidence summary</summary>{evidenceSummaryItems.map((item) => <p key={item}>{item}</p>)}</details></article>
  </main>;
}
