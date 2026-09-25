"use client";

import Link from "next/link";
import { useState } from "react";
import { publishedResultImportHref, publishedResultProvider } from "@/lib/publishedResultImport";

export default function PublishedResultImportPage() {
  const [sourceUrl, setSourceUrl] = useState("");
  const [error, setError] = useState("");

  function continueToImporter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const provider = publishedResultProvider(sourceUrl);
    if (!provider) {
      setError("Paste a ClayArena or Leirdue.net results link.");
      return;
    }
    window.location.assign(publishedResultImportHref(provider, sourceUrl));
  }

  return (
    <main className="container narrow">
      <section className="card" aria-labelledby="import-heading">
        <p className="eyebrow">Competition results</p>
        <h1 id="import-heading">Import</h1>
        <p>Choose where your published result is, then review it before saving.</p>
        <div className="productActionGrid" aria-label="Choose result service">
          <Link className="dashboardActionCard productActionCard secondaryAction" href="/import/leirdue">
            <span>Leirdue.net</span><small>Search by shooter name and year, or paste a Leirdue.net link.</small>
          </Link>
          <Link className="dashboardActionCard productActionCard secondaryAction" href="/import/clayarena">
            <span>ClayArena</span><small>Paste a public ClayArena competition results link.</small>
          </Link>
        </div>
        <form onSubmit={continueToImporter} className="publishedResultLinkForm">
          <label htmlFor="published-result-url">Already have a results link?</label>
          <p className="small muted">Paste it here and we will open the right import page.</p>
          <input id="published-result-url" type="url" inputMode="url" value={sourceUrl} onChange={(event) => { setSourceUrl(event.target.value); setError(""); }} placeholder="Paste a ClayArena or Leirdue.net link" required />
          {error ? <div className="error" role="alert">{error}</div> : null}
          <div className="btns"><button type="submit">Continue</button><Link className="button secondary" href="/log-competition">Back</Link></div>
        </form>
      </section>
    </main>
  );
}
