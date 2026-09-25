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
        <p>Paste a Leirdue.net or ClayArena results link. Review what we find before saving.</p>
        <form onSubmit={continueToImporter} className="publishedResultLinkForm">
          <label htmlFor="published-result-url">Results link</label>
          <input id="published-result-url" type="url" inputMode="url" value={sourceUrl} onChange={(event) => { setSourceUrl(event.target.value); setError(""); }} placeholder="Paste a ClayArena or Leirdue.net link" required />
          {error ? <div className="error" role="alert">{error}</div> : null}
          <div className="btns"><button type="submit">Find result</button></div>
        </form>
        <details className="detailAccordion">
          <summary>Other ways to import</summary>
          <div className="detailAccordionBody">
            <Link href="/import/leirdue">Search older Leirdue.net results</Link>
            <p className="small muted"><Link href="/import/clayarena">Open ClayArena importer</Link></p>
          </div>
        </details>
      </section>
    </main>
  );
}
