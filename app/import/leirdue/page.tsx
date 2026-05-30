"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DISCIPLINE_OPTIONS } from "@/lib/disciplines";
import { supabase } from "@/lib/supabase/client";
import type { LeirdueCandidate, LeirdueCategory, LeirdueSearchDebug } from "@/lib/leirdue/types";

const DEFAULT_DISCIPLINES = ["Compak Sporting", "Kompakt leirduesti", "Leirduesti", "Sporting"];
const OPTIONAL_DISCIPLINES = ["Trap", "Skeet", "Other"];
const DISCIPLINE_CHOICES = [...DEFAULT_DISCIPLINES, ...OPTIONAL_DISCIPLINES];
const SECTION_LABELS: Record<LeirdueCategory, string> = {
  recommended: "Recommended imports",
  review: "Review before import",
  control: "Control lists / not imported",
};

type EditableCandidate = LeirdueCandidate & { selected: boolean; localId: string; saveStatus?: "saved" | "duplicate" | "error"; saveMessage?: string };

type SaveResponse = {
  results?: { candidate: LeirdueCandidate; status: "saved" | "duplicate" | "error"; id?: string; message?: string }[];
  error?: string;
};

type SearchResponse = {
  candidates?: LeirdueCandidate[];
  debug?: LeirdueSearchDebug;
  error?: string;
};

function candidateSelectedByDefault(candidate: LeirdueCandidate) {
  return candidate.category === "recommended" && (candidate.confidence === "high" || candidate.confidence === "medium") && candidate.importRecommended;
}

function performance(candidate: EditableCandidate) {
  if (candidate.ownScore === null || !candidate.winningScore || candidate.winningScore <= 0) return null;
  return (Number(candidate.ownScore) / Number(candidate.winningScore)) * 100;
}

function toEditable(candidate: LeirdueCandidate, index: number): EditableCandidate {
  return { ...candidate, selected: candidateSelectedByDefault(candidate), localId: `${candidate.leirdueUrl}-${candidate.date}-${index}` };
}

function normalizeSaveError(response: SaveResponse) {
  return response.error || "Could not save selected Leirdue results.";
}

function CandidateCard({ candidate, onChange }: { candidate: EditableCandidate; onChange: (candidate: EditableCandidate) => void }) {
  const percent = performance(candidate);

  function update<Key extends keyof EditableCandidate>(key: Key, value: EditableCandidate[Key]) {
    onChange({ ...candidate, [key]: value, saveStatus: undefined, saveMessage: undefined });
  }

  return (
    <article className="candidateCard">
      <div className="candidateTopline">
        <label className="checkboxLabel importToggle">
          <input type="checkbox" checked={candidate.selected} onChange={(event) => update("selected", event.target.checked)} />
          <span>{candidate.selected ? "Import" : "Skip"}</span>
        </label>
        <div className="candidateBadges">
          <span className={`badge ${candidate.confidence === "high" ? "badgeGreen" : candidate.confidence === "medium" ? "badgeGold" : "badgeBlue"}`}>{candidate.confidence} confidence</span>
          {candidate.alreadyImported || candidate.saveStatus === "duplicate" ? <span className="badge badgeBlue">Already imported</span> : null}
          {candidate.saveStatus === "saved" ? <span className="badge badgeGreen">Saved</span> : null}
          {candidate.saveStatus === "error" ? <span className="badge danger">Error</span> : null}
        </div>
      </div>

      <div className="row">
        <div>
          <label>Date</label>
          <input type="date" value={candidate.date || ""} onChange={(event) => update("date", event.target.value)} />
        </div>
        <div>
          <label>Proposed discipline</label>
          <select value={candidate.discipline} onChange={(event) => update("discipline", event.target.value)}>
            {DISCIPLINE_OPTIONS.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>
      </div>

      <label>Competition name</label>
      <input value={candidate.name} onChange={(event) => update("name", event.target.value)} />

      <label>Shooting ground</label>
      <input value={candidate.shootingGround || ""} onChange={(event) => update("shootingGround", event.target.value)} placeholder="Shooting ground" />

      <div className="row threeColumnRow">
        <div>
          <label>Own score</label>
          <input type="number" min="0" inputMode="numeric" value={candidate.ownScore ?? ""} onChange={(event) => update("ownScore", Number(event.target.value))} />
        </div>
        <div>
          <label>Total targets</label>
          <input type="number" min="1" inputMode="numeric" value={candidate.totalTargets ?? ""} onChange={(event) => update("totalTargets", Number(event.target.value))} />
        </div>
        <div>
          <label>Winning score</label>
          <input type="number" min="1" inputMode="numeric" value={candidate.winningScore ?? ""} onChange={(event) => update("winningScore", Number(event.target.value))} />
        </div>
      </div>

      <div className="metricsRow">
        <span className="metricChip"><strong>{candidate.ownScore ?? "?"}/{candidate.totalTargets ?? "?"}</strong> own score</span>
        <span className="metricChip"><strong>{candidate.winningScore ?? "?"}/{candidate.totalTargets ?? "?"}</strong> winning score</span>
        {percent !== null ? <span className="metricChip highlightMetric"><strong>{percent.toFixed(1)}%</strong> performance</span> : null}
        <span className="metricChip"><strong>{candidate.listType || "Unknown list"}</strong></span>
      </div>

      <label>Leirdue URL</label>
      <input value={candidate.leirdueUrl} onChange={(event) => update("leirdueUrl", event.target.value)} placeholder="https://www.leirdue.net/..." />

      <label>Notes</label>
      <textarea value={candidate.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Parser notes or your correction notes" />

      <div className="btns">
        {candidate.leirdueUrl ? <a href={candidate.leirdueUrl} target="_blank" rel="noreferrer" className="button secondary">Open Leirdue link</a> : null}
      </div>
      {candidate.saveMessage ? <div className={candidate.saveStatus === "error" ? "error" : "notice"}>{candidate.saveMessage}</div> : null}
    </article>
  );
}

function DebugDetails({ debug, candidatesFound }: { debug: LeirdueSearchDebug | null; candidatesFound: number }) {
  if (!debug) return null;
  const recentStatuses = debug.fetchedUrls.slice(-6);
  return (
    <details className="card" open={candidatesFound === 0}>
      <summary>Debug details</summary>
      <div className="metricsRow">
        <span className="metricChip"><strong>{debug.fetchedUrls.length}</strong> pages fetched</span>
        <span className="metricChip"><strong>{debug.eventInfoPagesFetched}</strong> event info pages</span>
        <span className="metricChip"><strong>{debug.eventResultMenuPagesFetched}</strong> result menu pages</span>
        <span className="metricChip"><strong>{debug.listeIdLinksExtracted}</strong> liste_id links</span>
        <span className="metricChip"><strong>{debug.listeIdLinksFromResultMenus}</strong> from result menus</span>
        <span className="metricChip"><strong>{debug.listeIdPagesFetched}</strong> liste_id pages fetched</span>
        <span className="metricChip"><strong>{debug.listeIdShooterPagesFound}</strong> liste_id shooter pages</span>
        <span className="metricChip"><strong>{debug.candidateRowsCreated}</strong> candidates created</span>
        <span className="metricChip"><strong>{debug.candidateCategoryCounts.recommended}/{debug.candidateCategoryCounts.review}/{debug.candidateCategoryCounts.control}</strong> rec/review/control</span>
        <span className="metricChip"><strong>{debug.candidatesWithOwnScore}</strong> own score</span>
        <span className="metricChip"><strong>{debug.candidatesWithWinningScore}</strong> winning score</span>
        <span className="metricChip"><strong>{debug.candidatesWithTotalTargets}</strong> total targets</span>
        <span className="metricChip"><strong>{debug.candidatesWithShootingGround}</strong> shooting ground</span>
      </div>
      {candidatesFound === 0 ? <p className="small muted">No candidates found. Try broader filters or add result manually.</p> : null}
      {recentStatuses.length > 0 ? (
        <>
          <p className="small muted">Recent fetch statuses:</p>
          <ul className="small muted">
            {recentStatuses.map((item) => (
              <li key={`${item.url}-${item.status}-${item.note || ""}`}>{item.status ?? "network"} {item.ok ? "OK" : "failed"} — {item.url}{item.note ? ` (${item.note})` : ""}</li>
            ))}
          </ul>
        </>
      ) : null}
      {debug.listInspectionLimitReached ? <p className="small muted">Result list inspection limit reached.</p> : null}
      {debug.validationUrlsInspected > 0 ? <p className="small muted">Validation URLs inspected: {debug.validationUrlsInspected}; validation shooter matches: {debug.validationShooterMatches}</p> : null}
      {debug.resultMenuDiagnostics.length > 0 ? <p className="small muted">Result menu diagnostics: {debug.resultMenuDiagnostics.map((item) => `${item.eventUrl} contains ${Object.entries(item.contains).filter(([, value]) => value).map(([key]) => key).join(", ") || "none"}: ${item.snippet.slice(0, 240)}`).join(" | ")}</p> : null}
      {debug.firstListeIdUrlsInspected.length > 0 ? <p className="small muted">First liste_id URLs inspected: {debug.firstListeIdUrlsInspected.join("; ")}</p> : null}
      {debug.firstShooterMatchUrls.length > 0 ? <p className="small muted">Shooter found on: {debug.firstShooterMatchUrls.join("; ")}</p> : null}
      {debug.candidateReasons.length > 0 ? <p className="small muted">Candidate reasons: {debug.candidateReasons.slice(0, 8).join("; ")}</p> : null}
      {debug.rejectedReasons.length > 0 ? <p className="small muted">Rejected/skip reasons: {debug.rejectedReasons.slice(0, 5).join("; ")}</p> : null}
      {debug.firstUsefulSnippet ? <p className="small muted">First useful snippet: {debug.firstUsefulSnippet}</p> : null}
    </details>
  );
}

export default function LeirdueImportPage() {
  const [shooterName, setShooterName] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [disciplines, setDisciplines] = useState<string[]>(DEFAULT_DISCIPLINES);
  const [candidates, setCandidates] = useState<EditableCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [debug, setDebug] = useState<LeirdueSearchDebug | null>(null);

  const groupedCandidates = useMemo(() => {
    return {
      recommended: candidates.filter((candidate) => candidate.category === "recommended"),
      review: candidates.filter((candidate) => candidate.category === "review"),
      control: candidates.filter((candidate) => candidate.category === "control"),
    } satisfies Record<LeirdueCategory, EditableCandidate[]>;
  }, [candidates]);

  const selectedCount = candidates.filter((candidate) => candidate.selected).length;

  function toggleDiscipline(discipline: string) {
    setDisciplines((current) => (current.includes(discipline) ? current.filter((item) => item !== discipline) : [...current, discipline]));
  }

  function updateCandidate(updated: EditableCandidate) {
    setCandidates((current) => current.map((candidate) => (candidate.localId === updated.localId ? updated : candidate)));
  }

  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSearching(true);
    setCandidates([]);
    setDebug(null);

    const response = await fetch("/api/leirdue/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shooterName, year: Number(year), disciplines }),
    });
    const data = (await response.json()) as SearchResponse;
    setSearching(false);

    setDebug(data.debug || null);

    if (!response.ok) {
      setError(data.error || "Could not fetch Leirdue results right now.");
      return;
    }

    setCandidates((data.candidates || []).map(toEditable));
    if (!data.candidates?.length) setSuccess("No candidates found. Try broader filters or add result manually.");
  }

  async function saveSelected() {
    setError("");
    setSuccess("");
    const selected = candidates.filter((candidate) => candidate.selected);
    if (selected.length === 0) {
      setError("Select at least one candidate to save.");
      return;
    }

    setSaving(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setSaving(false);
      setError("You must be logged in to import Leirdue results.");
      return;
    }

    const response = await fetch("/api/leirdue/save", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ candidates: selected }),
    });
    const data = (await response.json()) as SaveResponse;
    setSaving(false);

    if (!response.ok || !data.results) {
      setError(normalizeSaveError(data));
      return;
    }

    setCandidates((current) =>
      current.map((candidate) => {
        const result = data.results?.find((item) => item.candidate.leirdueUrl === candidate.leirdueUrl && item.candidate.date === candidate.date && item.candidate.name === candidate.name);
        if (!result) return candidate;
        return {
          ...candidate,
          selected: result.status === "error",
          alreadyImported: result.status === "duplicate" || candidate.alreadyImported,
          saveStatus: result.status,
          saveMessage: result.message || (result.status === "saved" ? "Saved as a result-only session." : result.status === "duplicate" ? "Already imported" : "Could not save this candidate."),
        };
      }),
    );

    const saved = data.results.filter((result) => result.status === "saved").length;
    const duplicates = data.results.filter((result) => result.status === "duplicate").length;
    setSuccess(`${saved} result${saved === 1 ? "" : "s"} saved. ${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped.`);
  }

  return (
    <main>
      <form className="card" onSubmit={search}>
        <p className="eyebrow">Leirdue.net import</p>
        <h2>Import from Leirdue.net</h2>
        <p>Find old competition results and review before saving.</p>
        <div className="notice small">
          This v1 imports result-only sessions after your review. It does not import misses, bom data, scorecard photos, finals or control lists automatically.
        </div>

        <label>Shooter name</label>
        <input value={shooterName} onChange={(event) => setShooterName(event.target.value)} placeholder="Torbjørn Lunde" required />

        <label>Year</label>
        <input value={year} onChange={(event) => setYear(event.target.value)} type="number" min="1990" max={new Date().getFullYear() + 1} required />

        <fieldset className="checkboxGroup">
          <legend>Disciplines</legend>
          <p className="small muted">Select every relevant discipline to search at once.</p>
          {/* TODO: Later, discipline checkboxes can be preselected from a Shooter profile page where the user chooses which disciplines they shoot. */}
          <div className="checkboxGrid">
            {DISCIPLINE_CHOICES.map((discipline) => (
              <label key={discipline} className="checkboxLabel">
                <input type="checkbox" checked={disciplines.includes(discipline)} onChange={() => toggleDiscipline(discipline)} />
                <span>{discipline === "Other" ? "Other / unknown" : discipline}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {error ? <div className="error">{error}</div> : null}
        {success ? <div className="success">{success} {success.includes("saved") ? <Link href="/stats">Open Stats</Link> : null}</div> : null}

        <div className="btns">
          <button disabled={searching || disciplines.length === 0}>{searching ? "Searching..." : "Search Leirdue.net"}</button>
          <Link className="button secondary" href="/results/new">Add result manually</Link>
          <Link className="button secondary" href="/dashboard">Dashboard</Link>
        </div>
      </form>

      <DebugDetails debug={debug} candidatesFound={candidates.length} />

      {candidates.length > 0 ? (
        <div className="card">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">Review before save</p>
              <h2>Candidate results</h2>
              <p className="small muted">Edit any field before saving. Only checked candidates will be imported as result-only sessions.</p>
            </div>
            <span className="countPill">{selectedCount} selected</span>
          </div>
          <div className="btns">
            <button onClick={saveSelected} disabled={saving || selectedCount === 0}>{saving ? "Saving..." : "Save selected candidates"}</button>
            <Link href="/stats" className="button secondary">Stats</Link>
          </div>
        </div>
      ) : null}

      {(["recommended", "review", "control"] as LeirdueCategory[]).map((category) => (
        groupedCandidates[category].length > 0 ? (
          <section key={category} className="sessionGroup">
            <div className="groupHeader">
              <div>
                <h3>{SECTION_LABELS[category]}</h3>
                <p className="small muted">
                  {category === "recommended"
                    ? "Direct-looking competition results with enough score context."
                    : category === "review"
                      ? "Possible matches that need manual attention before import."
                      : "Cup/control/final/team/percentage/combined lists are shown for control and are not selected by default."}
                </p>
              </div>
              <span className="countPill">{groupedCandidates[category].length}</span>
            </div>
            {groupedCandidates[category].map((candidate) => (
              <CandidateCard key={candidate.localId} candidate={candidate} onChange={updateCandidate} />
            ))}
          </section>
        ) : null
      ))}
    </main>
  );
}
