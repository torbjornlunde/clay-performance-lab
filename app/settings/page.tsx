import Link from "next/link";
import AppearanceControl from "@/app/components/AppearanceControl";
import InstallAppCard from "@/app/components/InstallAppCard";
import { AppBackButton } from "@/app/components/navigation/AppBackButton";

export default function SettingsPage() {
  return (
    <main className="settingsMain">
      <div className="settingsIntro">
        <AppBackButton fallback="/dashboard" />
        <p className="eyebrow">Settings</p>
        <h2>Settings</h2>
        <p className="muted">Manage device-specific app preferences.</p>
      </div>
      <section className="card">
        <h3>Data cleanup</h3>
        <p className="muted">Group duplicate personal shooting ground names without changing original imported or logged text.</p>
        <Link href="/settings/shooting-grounds" className="button secondary">Clean up shooting grounds</Link>
      </section>
      <InstallAppCard />
      <AppearanceControl />
    </main>
  );
}
