import AppearanceControl from "@/app/components/AppearanceControl";

export default function SettingsPage() {
  return (
    <main className="settingsMain">
      <div className="settingsIntro">
        <p className="eyebrow">Settings</p>
        <h2>Settings</h2>
        <p className="muted">Manage device-specific app preferences.</p>
      </div>
      <AppearanceControl />
    </main>
  );
}
