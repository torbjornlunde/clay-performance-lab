"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { claimCoverage, CompetitionResultClaim, sourceCorrectionLabel, unclaimedCompetitionResults } from "@/lib/scoreSheets/competitionResultClaim";
import { supabase } from "@/lib/supabase/client";

export function CompetitionResultClaims({ initialResults, onClaimed }: { initialResults: CompetitionResultClaim[]; onClaimed: () => void }) {
  const [results, setResults] = useState(initialResults);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => setResults(initialResults), [initialResults]);
  const available = unclaimedCompetitionResults(results);
  const changed = results.filter(sourceCorrectionLabel);

  async function claim(result: CompetitionResultClaim) {
    if (!navigator.onLine) { setError("You need to be online to add this result."); return; }
    setBusy(result.shooter_id); setError("");
    const { data, error: rpcError } = await supabase.rpc("claim_competition_score_sheet_result", { p_score_sheet_id: result.score_sheet_id, p_shooter_id: result.shooter_id });
    setBusy(null);
    const sessionId = typeof data === "string" ? data : null;
    if (rpcError || !sessionId) { setError(rpcError?.message || "Could not add this result. Try again when online."); return; }
    setResults((items) => items.map((item) => item.shooter_id === result.shooter_id ? { ...item, claimed_session_id: sessionId } : item));
    onClaimed();
  }

  if (!available.length && !changed.length && !results.some((item) => item.claimed_session_id)) return null;
  return <section className="card competitionClaimCard" aria-labelledby="competition-claims-heading">
    <p className="eyebrow">Linked score sheets</p>
    <h2 id="competition-claims-heading">{available.length ? "Competition results available" : "Competition result updates"}</h2>
    {error && <div className="error" role="alert">{error}</div>}
    <div className="scoreSheetArchiveList">
      {results.map((result) => {
        const coverage = claimCoverage(result); const correction = sourceCorrectionLabel(result);
        return <article className="statListItem trainingScoreSheetArchiveItem" key={`${result.score_sheet_id}:${result.shooter_id}`}>
          <div>
            <strong>{result.event_title}</strong>
            <div className="small muted">{result.event_date} · {result.discipline}{result.location ? ` · ${result.location}` : ""}</div>
            <div className="small muted">Score {result.own_score} / {result.expected_targets} · {result.shooter_name}</div>
            {result.post_scores.length > 0 && <div className="small muted">{result.post_scores.map((post) => `${post.post}: ${post.score}/${post.maximum}`).join(" · ")}</div>}
            <div className="small muted">Finalized · {result.known_misses} known missed target{result.known_misses === 1 ? "" : "s"} · {result.scored_targets}/{result.expected_targets} target positions known</div>
            {!coverage.targetDetailComplete && <p className="small muted">Target-level miss detail was not available from the source result.</p>}
            {result.reopen_count > 0 && <p className="small muted">Corrected {result.reopen_count} time{result.reopen_count === 1 ? "" : "s"} before this version.</p>}
            {correction && <div className="notice">{correction}</div>}
            <p className="small muted">If the official score is incorrect, ask the organizer to correct the Competition Score Sheet.</p>
            <div className="btns archiveActions">
              {result.claimed_session_id ? <><span className="badge badgeBlue">Added to Results</span><Link className="button secondary smallButton" href={`/sessions/${result.claimed_session_id}?context=1`}>Open result</Link></> :
                <button className="button smallButton" type="button" disabled={busy === result.shooter_id} onClick={() => claim(result)}>{busy === result.shooter_id ? "Adding..." : "Add to my Results"}</button>}
            </div>
          </div>
        </article>;
      })}
    </div>
  </section>;
}
