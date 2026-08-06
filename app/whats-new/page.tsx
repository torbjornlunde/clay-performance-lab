import Link from "next/link";
import { AppBackButton } from "@/app/components/navigation/AppBackButton";
import { groupWhatsNewEntries, latestWhatsNewEntry, WHATS_NEW_ENTRIES } from "@/lib/updates/whatsNew";
import { WhatsNewSeenMarker } from "./WhatsNewSeenMarker";

export default function WhatsNewPage() {
  const groups = groupWhatsNewEntries(WHATS_NEW_ENTRIES);
  const latest = latestWhatsNewEntry(WHATS_NEW_ENTRIES);
  return (
    <main className="whatsNewPage">
      {latest ? <WhatsNewSeenMarker latestId={latest.id} /> : null}
      <header className="whatsNewIntro">
        <AppBackButton fallback="/dashboard" />
        <p className="eyebrow">Beta updates</p>
        <h2>What’s new</h2>
        <p className="muted">A short history of meaningful improvements available to beta shooters.</p>
      </header>
      {groups.map((group) => (
        <section className="whatsNewMonth" key={group.key} aria-labelledby={`updates-${group.key}`}>
          <h3 id={`updates-${group.key}`}>{group.heading}</h3>
          <div className="whatsNewList">
            {group.entries.map((entry) => (
              <article className="whatsNewEntry" key={entry.id}>
                <div className="whatsNewEntryHeading">
                  <h4>{entry.title}</h4><span className="whatsNewVersion">{entry.id}</span>
                </div>
                <ul>{entry.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
                {entry.href && entry.linkLabel ? <Link href={entry.href}>{entry.linkLabel}</Link> : null}
              </article>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
