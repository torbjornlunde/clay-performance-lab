"use client";

import { FormEvent, useState } from "react";
import { DISCIPLINE_OPTIONS } from "@/lib/disciplines";
import type { LeirdueCandidate, LeirdueCategory, LeirdueConfidence } from "@/lib/leirdue/types";

type DebugParseResult = {
  url: string;
  status: number | null;
  ok: boolean;
  error: string | null;
  pageTitle: string | null;
  eventTitle: string | null;
  listTitle: string | null;
  normalizedShooterName: string;
  shooterFound: boolean;
  rawSnippet: string | null;
  parsedRow: string | null;
  parsedNumbers: number[];
  parsedSeriesScores: number[];
  ownScore: number | null;
  totalTargets: number | null;
  winningScore: number | null;
  discipline: string | null;
  shootingGround: string | null;
  date: string | null;
  category: LeirdueCategory | null;
  confidence: LeirdueConfidence | null;
  importRecommended: boolean;
  parserNotes: string[];
  firstUsefulSnippet: string | null;
  candidateRows: { text: string; numbers: number[]; total: number | null; seriesScores: number[]; containsShooter: boolean }[];
  topCompetitorTotals: { row: string; total: number; numbers: number[] }[];
  candidate: LeirdueCandidate | null;
};

const EXAMPLE_URLS = [
  {
    label: "Torbjørn 2026 known validation example",
    url: "https://www.leirdue.net/?stevne=12667&meny=resultater&liste_id=57907",
    year: "2026",
    shooterName: "Torbjørn Lunde",
  },
  {
    label: "Torbjørn 2025 debug result 11412 / 51724",
    url: "https://www.leirdue.net/?stevne=11412&meny=resultater&liste_id=51724",
    year: "2025",
    shooterName: "Torbjørn Lunde",
  },
  {
    label: "Torbjørn 2025 debug result 12337 / 56520",
    url: "https://www.leirdue.net/?stevne=12337&meny=resultater&liste_id=56520",
    year: "2025",
    shooterName: "Torbjørn Lunde",
  },
];

const DEFAULT_DISCIPLINES = ["Compak Sporting", "Kompakt leirduesti", "Leirduesti", "Sporting"];

function value(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}

function CandidatePreview({ candidate }: { candidate: LeirdueCandidate }) {
  return (
    <section className="card">
      <h3>Candidate preview</h3>
      <div className="metricsRow">
        <span className="metricChip"><strong>{candidate.date || "?"}</strong> date</span>
        <span className="metricChip"><strong>{candidate.discipline}</strong> discipline</span>
        <span className="metricChip"><strong>{candidate.shootingGround || "?"}</strong> shooting ground</span>
        <span className="metricChip"><strong>{candidate.ownScore ?? "?"}/{candidate.totalTargets ?? "?"}</strong> own score</span>
        <span className="metricChip"><strong>{candidate.winningScore ?? "?"}</strong> winning score</span>
        <span className="metricChip"><strong>{candidate.category}/{candidate.confidence}</strong> category</span>
        <span className="metricChip"><strong>{candidate.importRecommended ? "yes" : "no"}</strong> checked by default</span>
      </div>
      <p><strong>{candidate.name}</strong></p>
      <p className="small muted">{candidate.notes}</p>
    </section>
  );
}

export default function LeirdueParserDebugPage() {
  const [url, setUrl] = useState(EXAMPLE_URLS[1].url);
  const [shooterName, setShooterName] = useState("Torbjørn Lunde");
  const [year, setYear] = useState("2025");
  const [disciplines, setDisciplines] = useState<string[]>(DEFAULT_DISCIPLINES);
  const [result, setResult] = useState<DebugParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function toggleDiscipline(discipline: string) {
    setDisciplines((current) => current.includes(discipline) ? current.filter((item) => item !== discipline) : [...current, discipline]);
  }

  async function parse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/leirdue/debug-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, shooterName, year: year ? Number(year) : null, selectedDisciplines: disciplines }),
      });
      const payload = await response.json();
      if (!response.ok && payload.error && !payload.url) throw new Error(payload.error);
      setResult(payload as DebugParseResult);
      if (!response.ok) setError(payload.error || "Leirdue debug parse failed.");
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "Leirdue debug parse failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <div className="container">
        <section className="card heroCard">
          <p className="eyebrow">Internal debug</p>
          <h1>Leirdue parser debug tool</h1>
          <p>Paste one Leirdue result-list URL to test the parser without running a full-year crawl.</p>
        </section>

        <section className="card">
          <h2>Known debug URLs</h2>
          <div className="btns">
            {EXAMPLE_URLS.map((example) => (
              <button
                key={example.url}
                type="button"
                className="button secondary"
                onClick={() => {
                  setUrl(example.url);
                  setYear(example.year);
                  setShooterName(example.shooterName);
                }}
              >
                {example.label}
              </button>
            ))}
          </div>
        </section>

        <form className="card" onSubmit={parse}>
          <label>Leirdue URL</label>
          <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.leirdue.net/?stevne=11412&meny=resultater&liste_id=51724" required />

          <label>Shooter name</label>
          <input value={shooterName} onChange={(event) => setShooterName(event.target.value)} placeholder="Enter shooter name" required />

          <label>Selected year (optional)</label>
          <input type="number" min="1990" value={year} onChange={(event) => setYear(event.target.value)} placeholder="2025" />

          <label>Selected disciplines</label>
          <div className="checkboxGrid">
            {DISCIPLINE_OPTIONS.map((discipline) => (
              <label key={discipline} className="checkboxLabel">
                <input type="checkbox" checked={disciplines.includes(discipline)} onChange={() => toggleDiscipline(discipline)} />
                <span>{discipline}</span>
              </label>
            ))}
          </div>

          <div className="btns">
            <button className="button" disabled={loading}>{loading ? "Parsing..." : "Parse result page"}</button>
          </div>
        </form>

        {error ? <div className="error">{error}</div> : null}

        {result ? (
          <>
            <section className="card">
              <h2>Parser result</h2>
              <div className="metricsRow">
                <span className="metricChip"><strong>{value(result.status)}</strong> HTTP status</span>
                <span className="metricChip"><strong>{value(result.shooterFound)}</strong> shooter found</span>
                <span className="metricChip"><strong>{value(result.normalizedShooterName)}</strong> normalized name</span>
                <span className="metricChip"><strong>{value(result.ownScore)}/{value(result.totalTargets)}</strong> own score</span>
                <span className="metricChip"><strong>{value(result.winningScore)}</strong> winning score</span>
                <span className="metricChip"><strong>{value(result.category)}/{value(result.confidence)}</strong> category</span>
                <span className="metricChip"><strong>{value(result.importRecommended)}</strong> import recommended</span>
              </div>
              <dl className="detailsList">
                <dt>URL fetched</dt><dd>{result.url}</dd>
                <dt>Page title</dt><dd>{value(result.pageTitle)}</dd>
                <dt>Event title</dt><dd>{value(result.eventTitle)}</dd>
                <dt>List title</dt><dd>{value(result.listTitle)}</dd>
                <dt>Date</dt><dd>{value(result.date)}</dd>
                <dt>Discipline</dt><dd>{value(result.discipline)}</dd>
                <dt>Shooting ground</dt><dd>{value(result.shootingGround)}</dd>
                <dt>Parsed row</dt><dd>{value(result.parsedRow)}</dd>
                <dt>Parsed numbers</dt><dd>{result.parsedNumbers.join(", ") || "—"}</dd>
                <dt>Parsed series scores</dt><dd>{result.parsedSeriesScores.join(", ") || "—"}</dd>
                <dt>Raw snippet</dt><dd>{value(result.rawSnippet)}</dd>
                <dt>First useful snippet</dt><dd>{value(result.firstUsefulSnippet)}</dd>
              </dl>
            </section>

            {result.candidate ? <CandidatePreview candidate={result.candidate} /> : null}

            <section className="card">
              <h2>Parser notes / reasons</h2>
              <ul className="small muted">
                {result.parserNotes.map((note, index) => <li key={`${note}-${index}`}>{note}</li>)}
              </ul>
            </section>

            <section className="card">
              <h2>Candidate rows</h2>
              <p className="small muted">Rows that looked like competitor rows. Shooter rows are marked.</p>
              <ul className="small muted">
                {result.candidateRows.map((row, index) => (
                  <li key={`${row.text}-${index}`}>
                    {row.containsShooter ? "★ " : ""}{row.text} — total {value(row.total)} — numbers {row.numbers.join(", ") || "—"} — series {row.seriesScores.join(", ") || "—"}
                  </li>
                ))}
              </ul>
            </section>

            <section className="card">
              <h2>Top competitor totals used for winningScore</h2>
              <ol className="small muted">
                {result.topCompetitorTotals.map((row, index) => (
                  <li key={`${row.row}-${index}`}>{row.total} — {row.row} — numbers {row.numbers.join(", ")}</li>
                ))}
              </ol>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
