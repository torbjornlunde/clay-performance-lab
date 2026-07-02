"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export type CompetitionTemplateCandidate = {
  id: string;
  name: string;
  competition_date: string;
  shooting_ground: string | null;
  discipline: string;
  creator_label: string;
  post_count: number;
  target_count: number;
  is_complete: boolean;
  template_version: number;
  updated_at: string;
  match_score: number;
  match_reasons: string[];
};

export type CompetitionTemplateSuggestionMetadata = {
  name: string;
  competitionDate: string;
  shootingGround: string;
  discipline: string;
  targetCount: number | null;
};

type Props = {
  metadata: CompetitionTemplateSuggestionMetadata;
  candidates: CompetitionTemplateCandidate[];
  loading?: boolean;
  error?: string;
  onFind: () => void;
  canFind: boolean;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "No date";
  return value.slice(0, 10);
}

export function CompetitionTemplateSuggestions({ metadata, candidates, loading = false, error = "", onFind, canFind }: Props) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [hiddenAll, setHiddenAll] = useState(false);
  const [copyingId, setCopyingId] = useState("");
  const [message, setMessage] = useState("");
  const visible = hiddenAll ? [] : candidates.filter((candidate) => !dismissed.has(candidate.id));

  async function useSetup(candidate: CompetitionTemplateCandidate) {
    setMessage("");
    if (candidate.discipline !== metadata.discipline) {
      setMessage("This setup uses a different discipline and cannot be used here.");
      return;
    }
    if (!window.confirm("Your competition details will be kept. The target setup will be copied from this template.")) return;
    setCopyingId(candidate.id);
    const { data, error } = await supabase.rpc("copy_competition_template_to_new_session", {
      p_template_id: candidate.id,
      p_name: metadata.name.trim() || candidate.name,
      p_competition_date: metadata.competitionDate,
      p_shooting_ground: metadata.shootingGround.trim() || null,
    });
    setCopyingId("");
    if (error || !data) {
      setMessage("Could not use this shared setup. You can continue without one.");
      return;
    }
    router.push(`/sessions/${data}`);
  }

  return (
    <section className="templateSuggestions" aria-label="Competition setup suggestions">
      <div className="templateSuggestionsHeader">
        <div>
          <h3>Possible competition setups found</h3>
          <p className="small muted">Suggestions are searchable shared templates. Nothing is copied unless you preview and confirm.</p>
        </div>
        <button type="button" className="secondary" onClick={onFind} disabled={!canFind || loading}>{loading ? "Checking..." : "Find setup"}</button>
      </div>
      {!canFind && <p className="small muted">Add a discipline and competition date to check for shared setups.</p>}
      {error && <p className="small warning">Could not check for shared setups. You can continue without one.</p>}
      {message && <p className="small warning">{message}</p>}
      {visible.length > 0 && (
        <div className="templateSuggestionList">
          {visible.map((candidate) => (
            <article className="templateSuggestionCard" key={candidate.id}>
              <div className="templateSuggestionTopline">
                <strong>{candidate.name}</strong>
                <span className={candidate.is_complete ? "pill good" : "pill"}>{candidate.is_complete ? "Complete" : "Incomplete"}</span>
              </div>
              <p className="small muted">{formatDate(candidate.competition_date)} · {candidate.shooting_ground || "No shooting ground"} · {candidate.discipline}</p>
              <p className="small muted">{candidate.creator_label} · {candidate.target_count || "Unknown"} targets · updated {formatDate(candidate.updated_at)} · v{candidate.template_version}</p>
              <details className="templateSuggestionReasons">
                <summary>Why this was suggested</summary>
                <ul>{candidate.match_reasons.slice(0, 4).map((reason) => <li key={reason}>{reason}</li>)}</ul>
              </details>
              <div className="btns compactBtns">
                <Link className="button secondary" href={`/competition-templates/${candidate.id}`} target="_blank">Preview</Link>
                <button type="button" onClick={() => useSetup(candidate)} disabled={copyingId === candidate.id}>{copyingId === candidate.id ? "Using..." : "Use this setup"}</button>
                <button type="button" className="secondary" onClick={() => setDismissed((old) => new Set(old).add(candidate.id))}>Not the same competition</button>
              </div>
            </article>
          ))}
          <button type="button" className="secondary" onClick={() => setHiddenAll(true)}>Dismiss all suggestions</button>
        </div>
      )}
      {!loading && canFind && candidates.length === 0 && !error && <p className="small muted">No likely shared setup found yet. You can continue without one.</p>}
    </section>
  );
}
