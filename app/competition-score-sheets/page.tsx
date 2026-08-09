"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { draftHasPendingRecovery, scoreSheetDraftKey } from "@/lib/scoreSheets/drafts";
import { formatDateOnly } from "@/lib/scoreSheets/liveSafety";

type CompetitionSheet = { id: string; title: string; session_date: string; location: string | null; discipline: string; total_targets: number; updated_at: string | null; training_score_sheet_shooters: { count: number }[]; training_score_sheet_target_results: { count: number }[] };

export default function CompetitionScoreSheetsPage() {
  const [sheets, setSheets] = useState<CompetitionSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { void (async () => {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) { window.location.assign("/login"); return; }
    const { data, error: loadError } = await supabase.from("training_score_sheets")
      .select("id,title,session_date,location,discipline,total_targets,updated_at,training_score_sheet_shooters(count),training_score_sheet_target_results(count)")
      .eq("session_type", "competition").order("session_date", { ascending: false }).returns<CompetitionSheet[]>();
    if (loadError) setError("Could not load Competition Score Sheets. Check your connection and try again.");
    else setSheets(data || []);
    setLoading(false);
  })(); }, []);
  return <main className="container narrow"><div className="card">
    <div className="heroTopline"><div><p className="eyebrow">Competition Score Sheets</p><h1>Score competitions live</h1><p className="muted">One scorer, one authoritative device, with local recovery during temporary connection loss.</p></div><Link className="button primaryAction" href="/competition-score-sheets/new">New Competition Score Sheet</Link></div>
    {error && <div className="error" role="alert">{error}</div>}
    {loading ? <p>Loading Competition Score Sheets...</p> : sheets.length === 0 ? <div className="emptyState"><p>No Competition Score Sheets yet.</p><Link className="button" href="/competition-score-sheets/new">New Competition Score Sheet</Link></div> : <div className="stack">{sheets.map((sheet) => {
      const shooters = sheet.training_score_sheet_shooters?.[0]?.count || 0; const scored = sheet.training_score_sheet_target_results?.[0]?.count || 0; const expected = shooters * sheet.total_targets; const local = typeof window !== "undefined" && draftHasPendingRecovery(localStorage.getItem(scoreSheetDraftKey("competition", sheet.id)), "competition");
      return <Link key={sheet.id} href={`/competition-score-sheets/${sheet.id}`} className="subcard dashboardActionCard"><strong>{sheet.title}</strong><span>{formatDateOnly(sheet.session_date)} · {sheet.discipline}</span>{sheet.location && <span>{sheet.location}</span>}<span>{shooters} shooters · {scored} of {expected} targets scored</span>{local && <span className="badge badgeGold">Local recovery available</span>}</Link>;
    })}</div>}
  </div></main>;
}
