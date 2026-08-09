"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { formatDateOnly } from "@/lib/scoreSheets/liveSafety";
import { buildCompetitionResultCsv, competitionResultFilename } from "@/lib/scoreSheets/resultCsv";
import { isAuthoritativeCompetitionResult, projectScoreSheetResults, type ProjectedShooterResult, type ResultScoreRow, type ResultShooterRow, type ResultTargetRow } from "@/lib/scoreSheets/results";

type Sheet = { id: string; title: string; session_date: string; location: string | null; discipline: string; session_type: string; number_of_posts: number; targets_per_post: number; expected_targets_by_post: number[] | null; competition_status: string | null; competition_finalized_at: string | null; competition_finalized_with_incomplete: boolean | null; competition_finalized_unscored_targets: number | null; competition_reopen_count: number | null };
type State = "loading" | "ready" | "live" | "error" | "empty";

export default function CompetitionResultPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [results, setResults] = useState<ProjectedShooterResult[]>([]);
  const [state, setState] = useState<State>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => { if (!id) return; void (async () => {
    setState("loading"); setMessage("");
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { router.push("/login"); return; }
    const { data: loaded, error } = await supabase.from("training_score_sheets")
      .select("id,title,session_date,location,discipline,session_type,number_of_posts,targets_per_post,expected_targets_by_post,competition_status,competition_finalized_at,competition_finalized_with_incomplete,competition_finalized_unscored_targets,competition_reopen_count")
      .eq("id", id).eq("session_type", "competition").maybeSingle<Sheet>();
    if (error || !loaded) { setState("error"); setMessage("This Competition result was not found or is not accessible."); return; }
    setSheet(loaded);
    if (!isAuthoritativeCompetitionResult(loaded.session_type, loaded.competition_status)) { setState("live"); return; }
    const [shooters, scores, targets] = await Promise.all([
      supabase.from("training_score_sheet_shooters").select("id,shooter_name,display_order").eq("score_sheet_id", id).order("display_order").returns<ResultShooterRow[]>(),
      supabase.from("training_score_sheet_scores").select("shooter_id,post_number,score").eq("score_sheet_id", id).returns<ResultScoreRow[]>(),
      supabase.from("training_score_sheet_target_results").select("shooter_id,post_number,target_number,result").eq("score_sheet_id", id).returns<ResultTargetRow[]>(),
    ]);
    if (shooters.error || scores.error || targets.error) { setState("error"); setMessage("The saved shooter results could not be loaded. Check your connection and try again."); return; }
    if (!shooters.data?.length) { setState("empty"); return; }
    setResults(projectScoreSheetResults({ setup: { postCount: loaded.number_of_posts, targetsPerPost: loaded.targets_per_post, expectedTargetsByPost: loaded.expected_targets_by_post }, shooters: shooters.data, scores: scores.data || [], targetResults: targets.data || [] }));
    setState("ready");
  })(); }, [id, router]);

  const isCompak = sheet?.discipline.toLowerCase().includes("compak") || false;
  const postLabel = isCompak ? "Plate" : "Post";
  const finalizedIso = useMemo(() => sheet?.competition_finalized_at ? new Date(sheet.competition_finalized_at).toISOString() : "", [sheet?.competition_finalized_at]);
  function downloadCsv() {
    if (!sheet || state !== "ready" || !results.length || !finalizedIso || typeof URL.createObjectURL !== "function") { setMessage("CSV download is not available in this browser."); return; }
    try {
      const csv = buildCompetitionResultCsv({ competition: sheet.title, date: sheet.session_date.slice(0, 10), location: sheet.location || "", discipline: sheet.discipline, finalizedAt: finalizedIso, reopenCount: sheet.competition_reopen_count || 0, finalizedIncomplete: Boolean(sheet.competition_finalized_with_incomplete), postLabel }, results);
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = competitionResultFilename(sheet.session_date.slice(0, 10)); document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    } catch { setMessage("The CSV could not be generated. Please try again."); }
  }

  if (state === "loading") return <main className="container narrow"><div className="card"><p>Loading final Competition result...</p></div></main>;
  if (state === "live" && sheet) return <main className="container narrow"><div className="card"><p className="eyebrow">Competition result</p><h1>Result not finalized</h1><p>This Competition Score Sheet is still live. Finalize it before opening the final result.</p><Link className="button" href={`/competition-score-sheets/${sheet.id}`}>Back to Competition Score Sheet</Link></div></main>;
  if (state !== "ready" || !sheet) return <main className="container narrow"><div className="card"><h1>Competition result unavailable</h1><p role="alert">{message || "The finalized result has no saved shooters. No result was invented."}</p><Link className="button" href={sheet ? `/competition-score-sheets/${sheet.id}` : "/competition-score-sheets"}>Back to Competition Score Sheets</Link></div></main>;

  return <main className="container competitionResultPage"><article className="card competitionResultDocument">
    <div className="competitionResultHeader"><div><p className="eyebrow">Final Competition result</p><h1>{sheet.title}</h1><p className="muted">{formatDateOnly(sheet.session_date)} · {sheet.discipline}{sheet.location ? ` · ${sheet.location}` : ""}</p></div><div className="competitionResultStatuses"><span className="badge badgeGold">Finalized</span>{(sheet.competition_reopen_count || 0) > 0 && <span className="badge">Corrected · {sheet.competition_reopen_count} {(sheet.competition_reopen_count || 0) === 1 ? "reopen" : "reopens"}</span>}</div></div>
    <p className="small">Finalized {sheet.competition_finalized_at ? new Date(sheet.competition_finalized_at).toLocaleString() : "timestamp unavailable"}</p>
    {sheet.competition_finalized_with_incomplete && <div className="warning" role="alert"><strong>Finalized with incomplete target coverage</strong><br />{sheet.competition_finalized_unscored_targets || 0} target positions were unscored at finalization.</div>}
    <div className="competitionResultActions printHidden"><Link className="button secondary" href={`/competition-score-sheets/${sheet.id}`}>Back to Score Sheet</Link><button type="button" className="secondary" onClick={() => window.print()}>Print result</button><button type="button" onClick={downloadCsv}>Download CSV</button></div>
    {message && <p className="error printHidden" role="alert">{message}</p>}
    <div className="competitionResultTableWrap"><table className="competitionResultTable"><thead><tr><th>Shooter</th>{Array.from({ length: sheet.number_of_posts }, (_, i) => <th key={i}>{postLabel} {i + 1}</th>)}<th>Total</th><th>Scored</th><th>Unscored</th></tr></thead><tbody>{results.map((row) => <tr key={row.shooterId}><th><span>{row.displayName}</span>{row.tiedOnTotal && <span className="badge">Tied on score</span>}</th>{row.postScores.map((score, i) => <td key={i}>{score}/{row.expectedTargets ? (sheet.expected_targets_by_post?.[i] || sheet.targets_per_post) : sheet.targets_per_post}</td>)}<td className="resultTotal">{row.totalScore}/{row.expectedTargets}</td><td>{row.scoredTargets}</td><td>{row.unscoredTargets}</td></tr>)}</tbody></table></div>
  </article></main>;
}
