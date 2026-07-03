import AppearanceControl from "@/app/components/AppearanceControl";
import Link from "next/link";

export default function SettingsPage() {
  return (
    <main>
      <section className="heroCard settingsHero" aria-labelledby="settings-heading">
        <p className="eyebrow">Settings</p>
        <h2 id="settings-heading">Settings</h2>
        <p className="muted">Manage device-specific app preferences.</p>
      </section>
      <AppearanceControl />
      <div className="row">
        <Link className="secondary" href="/dashboard">Back to dashboard</Link>
      </div>
    </main>
  );
}
