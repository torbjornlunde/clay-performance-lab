import Link from "next/link";

const trainingActions = [
  {
    href: "/training-score-sheets/new",
    title: "Training score sheets",
    description: "Score one or more shooters during training.",
  },
  {
    href: "/sessions/new?type=training",
    title: "Personal training log",
    description: "Log your own training session.",
  },
  {
    href: "/training-score-sheets",
    title: "Existing training score sheets",
    description: "Open saved, draft, or unsynced score sheets.",
  },
];

export default function LogTrainingPage() {
  return (
    <main className="container narrow">
      <div className="card productNavPage">
        <div className="heroTopline">
          <div>
            <p className="eyebrow">Log training</p>
            <h1>Choose how to record training</h1>
            <p className="muted">Create a score sheet, log personal practice, or return to existing work.</p>
          </div>
          <div className="btns heroActions">
            <Link href="/dashboard" className="button secondary smallButton">Dashboard</Link>
          </div>
        </div>

        <div className="productActionGrid" aria-label="Training logging options">
          {trainingActions.map((action) => (
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
