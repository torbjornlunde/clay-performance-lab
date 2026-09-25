import Link from "next/link";

const advancedActions = [
  { href: "/competition-score-sheets", title: "Competition Score Sheet", description: "Set up several shooters and score every target live from one device." },
  { href: "/results/quick", title: "Live quick score", description: "Score your hits and misses quickly during a live competition." },
  { href: "/sessions/new?type=competition", title: "Start with detailed setup", description: "Create courses, schemes or post setup before logging misses." },
];

export default function LogCompetitionPage() {
  return (
    <main className="container narrow">
      <div className="card productNavPage">
        <div className="heroTopline">
          <div>
            <p className="eyebrow">Log competition</p>
            <h1>Save a competition</h1>
            <p className="muted">Add the competition first. You can record a score, context, scorecard or detailed misses now or later.</p>
          </div>
          <div className="btns heroActions">
            <Link href="/dashboard" className="button secondary smallButton">Dashboard</Link>
          </div>
        </div>

        <section aria-labelledby="recommended-competition-action">
          <p className="eyebrow">Recommended</p>
          <Link href="/results/new" className="dashboardActionCard productActionCard primaryAction competitionRecommendedAction">
            <span id="recommended-competition-action">Add competition</span>
            <small>Save the basics and your result, then add more detail only when it is useful.</small>
          </Link>
        </section>

        <section aria-labelledby="published-result-action">
          <h2 id="published-result-action" className="sectionTitle">Already published online?</h2>
          <Link href="/import" className="dashboardActionCard productActionCard secondaryAction">
            <span>Import</span>
            <small>Choose Leirdue.net or ClayArena, or paste a results link.</small>
          </Link>
        </section>

        <details className="detailAccordion">
          <summary><span>Other ways to start</span></summary>
          <div className="detailAccordionBody">
            <p className="small muted">Use these options when you need live scoring or want to build the full setup before saving.</p>
            <div className="productActionGrid">
              {advancedActions.map((action) => (
                <Link key={action.href} href={action.href} className="dashboardActionCard productActionCard secondaryAction">
                  <span>{action.title}</span>
                  <small>{action.description}</small>
                </Link>
              ))}
            </div>
          </div>
        </details>

        <p className="small muted competitionHistoryLink">Looking for a saved competition? <Link href="/results">View My results</Link>.</p>
      </div>
    </main>
  );
}
