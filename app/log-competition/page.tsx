import Link from "next/link";

const primaryActions = [
  { href: "/results/new", title: "Register competition", description: "Start with competition basics. Add score, posts, targets and misses when you are ready." },
  { href: "/import/leirdue", title: "Import from Leirdue.net", description: "Bring in a published result from Leirdue.net." },
  { href: "/results", title: "My results", description: "Open, review, edit and delete saved competition results." },
];

const advancedActions = [
  { href: "/results/quick", title: "Live quick score", description: "Score hits and misses quickly during a live competition." },
  { href: "/sessions/new?type=competition", title: "Start with detailed setup", description: "Create courses, schemes or post setup before logging misses." },
];

export default function LogCompetitionPage() {
  return (
    <main className="container narrow">
      <div className="card productNavPage">
        <div className="heroTopline">
          <div>
            <p className="eyebrow">Log competition</p>
            <h1>What do you want to do?</h1>
            <p className="muted">Most users should start with Register competition. You can add posts, targets and detailed misses afterward.</p>
          </div>
          <div className="btns heroActions">
            <Link href="/dashboard" className="button secondary smallButton">Dashboard</Link>
          </div>
        </div>

        <div className="productActionGrid" aria-label="Competition actions">
          {primaryActions.map((action, index) => (
            <Link key={action.href} href={action.href} className={`dashboardActionCard productActionCard ${index === 0 ? "primaryAction" : "secondaryAction"}`}>
              <span>{action.title}</span>
              <small>{action.description}</small>
            </Link>
          ))}
        </div>

        <details className="detailAccordion">
          <summary><span>Advanced ways to start</span></summary>
          <div className="detailAccordionBody">
            <p className="small muted">Use these specialist flows only when you need live scoring or full setup before creating the competition.</p>
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
      </div>
    </main>
  );
}
