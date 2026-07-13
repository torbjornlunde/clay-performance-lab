"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { buildCoachReport } from "@/lib/analysis/coachReport";
import { recordAnalyticsEvent } from "@/lib/analytics";
import { supabase } from "@/lib/supabase/client";

export default function CoachReportPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [misses, setMisses] = useState<any[]>([]);
  const [postTargets, setPostTargets] = useState<any[]>([]);
  const [imports, setImports] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [privateNotes, setPrivateNotes] = useState<any[]>([]);
  const [includeNotesContext, setIncludeNotesContext] = useState(true);
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => { void load(); }, []);

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { router.push("/login"); return; }
    const { data: sessionData } = await supabase
      .from("sessions")
      .select("id,name,discipline,shooting_format,session_type,own_score,winning_score,total_targets,post_count,targets_per_post,created_at,competition_date,shooting_ground,user_id")
      .eq("id", params.id)
      .single();
    const [{ data: missData }, { data: postTargetData }, { data: importData }, { data: historyData }, { data: privateNoteData }] = await Promise.all([
      supabase.from("misses").select("*").eq("session_id", params.id).order("created_at"),
      supabase.from("session_post_targets").select("post_number,target_position,presentation_number,presentation_type,position_in_presentation,target_label,target_type,direction,angle,speed,distance,difficulty,notes").eq("session_id", params.id),
      supabase.from("scorecard_imports").select("reviewed_total_targets,reviewed_hits,reviewed_misses,inserted_misses,skipped_duplicates,created_at").eq("session_id", params.id).order("created_at", { ascending: false }),
      sessionData ? supabase.from("sessions").select("id,name,discipline,session_type,own_score,total_targets,winning_score,competition_date,created_at").eq("user_id", sessionData.user_id).order("competition_date", { ascending: false, nullsFirst: false }) : Promise.resolve({ data: [] }),
      supabase.from("private_session_notes").select("note_scope,post_number,body").eq("session_id", params.id),
    ]);
    const notes = (privateNoteData || []).filter((note) => String(note.body || "").trim().length > 0);
    setSession(sessionData);
    setMisses(missData || []);
    setPostTargets(postTargetData || []);
    setImports(importData || []);
    setHistory(historyData || []);
    setPrivateNotes(notes);
    setIncludeNotesContext(notes.length > 0);
  }

  const report = useMemo(() => session ? buildCoachReport({ session, misses, scorecardImport: imports[0] || null, postTargets, history, privateNotes, includeNotesContext }) : null, [session, misses, imports, postTargets, history, privateNotes, includeNotesContext]);

  useEffect(() => {
    if (!session || !report) return;
    void recordAnalyticsEvent(supabase, "coach_report_preview_opened", { route: "/sessions/[id]/coach-report", feature: "coach_report", discipline: session.discipline, sessionId: session.id, metadata: { discipline: session.discipline, hasNotesContext: report.hasNotesContext, sectionCount: report.sections.length, reportType: "single_session" } });
  }, [session?.id]);

  async function copyReport() {
    if (!report) return;
    setCopyStatus("");
    try {
      await navigator.clipboard.writeText(report.plainText);
      setCopyStatus("Copied");
      void recordAnalyticsEvent(supabase, "coach_report_copied", { route: "/sessions/[id]/coach-report", feature: "coach_report", discipline: session.discipline, sessionId: session.id, metadata: { discipline: session.discipline, hasNotesContext: report.hasNotesContext, sectionCount: report.sections.length, reportType: "single_session" } });
    } catch {
      setCopyStatus("Copy failed. Select the report text and copy it manually.");
    }
  }

  if (!session || !report) return <main><div className="card">Loading...</div></main>;
  const hasPrivateNotes = privateNotes.length > 0;
  const canBuildAnalysis = report.analysis.findings.length > 0 && report.analysis.recommendations.length > 0;

  return <main className="coachReportPage">
    <section className="card coachReportHero">
      <p className="small muted"><Link href={`/sessions/${session.id}/analysis`}>← Back to analysis</Link></p>
      <h1>Coach report preview</h1>
      <p className="muted">Review this private single-session summary, then copy it manually into a message or email.</p>
      <p className="small muted">This is a training-support summary, not a replacement for a coach watching you shoot.</p>
      {hasPrivateNotes && <div className="analysisPrivateNotesControl">
        <label className="checkboxRow">
          <input type="checkbox" checked={includeNotesContext} onChange={(event) => setIncludeNotesContext(event.target.checked)} />
          <span>Include notes-based context</span>
        </label>
        <p className="small muted">Only summarized note themes are included. Raw private notes are not shown.</p>
      </div>}
      <div className="btns"><button type="button" onClick={copyReport}>Copy report</button>{copyStatus && <span className={copyStatus === "Copied" ? "successInline" : "errorInline"}>{copyStatus}</span>}</div>
    </section>
    {!canBuildAnalysis ? <section className="card"><h2>Report not ready</h2><p>Add score or miss data before building a coach report preview.</p></section> : <article className="card coachReportPreview" aria-label="Coach report plain-text preview">
      {report.sections.map((section) => <section key={section.title} className="coachReportSection"><h2>{section.title}</h2>{section.items.map((item) => <p key={item}>• {item}</p>)}</section>)}
    </article>}
  </main>;
}
