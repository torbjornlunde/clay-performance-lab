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
      <form className="card" onSubmit={continueToImporter}>
        <p className="eyebrow">Log competition</p>
        <h1>Import published result</h1>
        <p>Paste your public results link. We will recognize the source, then you can review your result before saving.</p>
        <label htmlFor="published-result-url">Results link</label>
        <input id="published-result-url" type="url" inputMode="url" value={sourceUrl} onChange={(event) => { setSourceUrl(event.target.value); setError(""); }} placeholder="Paste a ClayArena or Leirdue.net link" required />
        {error ? <div className="error" role="alert">{error}</div> : null}
        <div className="btns">
          <button type="submit">Continue</button>
          <Link className="button secondary" href="/log-competition">Back</Link>
        </div>
        <div className="subcard publishedResultProviders">
          <h2>Supported result services</h2>
          <p className="small muted">No link ready? Open a service directly.</p>
          <div className="btns">
            <Link className="button secondary" href="/import/clayarena">ClayArena</Link>
            <Link className="button secondary" href="/import/leirdue">Leirdue.net</Link>
          </div>
        </div>
      </form>
    </main>
  );
}
