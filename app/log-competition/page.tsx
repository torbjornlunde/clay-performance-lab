import Link from "next/link";

const competitionActions = [
  {
    href: "/results/new",
    title: "Quick result only",
    description: "Save competition name, date, score, and winning score.",
  },
  {
    href: "/sessions/new?type=competition",
    title: "Detailed shooting log",
    description: "Use when you want misses, targets, reasons, and course details.",
  },
  {
    href: "/import/leirdue",
    title: "Import from Leirdue.net",
    description: "Find and review competition results from Leirdue.net.",
  },
];

export default function LogCompetitionPage() {
  return (
    <main className="container narrow">
      <div className="card productNavPage">
        <div className="heroTopline">
          <div>
            <p className="eyebrow">Log competition</p>
            <h1>Choose how to record a competition</h1>
            <p className="muted">Save a quick result, build a detailed log, import, or manage saved results.</p>
          </div>
          <div className="btns heroActions">
            <Link href="/results" className="button smallButton">Manage results</Link>
            <Link href="/dashboard" className="button secondary smallButton">Dashboard</Link>
          </div>
        </div>

        <div className="productActionGrid" aria-label="Competition logging options">
          <Link href="/results" className="dashboardActionCard productActionCard secondaryAction">
            <span>Manage results</span>
            <small>Open, review, edit, and delete saved competition results.</small>
          </Link>
          {competitionActions.map((action) => (
            <Link key={action.href} href={action.href} className="dashboardActionCard productActionCard secondaryAction">
              <span>{action.title}</span>
              <small>{action.description}</small>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
