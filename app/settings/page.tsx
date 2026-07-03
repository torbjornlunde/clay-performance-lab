import Link from "next/link";
import AppearanceControl from "@/app/components/AppearanceControl";

export default function SettingsPage() {
  return (
    <main>
      <div className="heroCard">
        <div>
          <p className="eyebrow">App preferences</p>
          <h2>Settings</h2>
          <p>Manage preferences that apply to the app rather than your shooter profile.</p>
        </div>
        <Link href="/dashboard" className="button secondary smallButton">Back to dashboard</Link>
      </div>

      <AppearanceControl />
    </main>
  );
}
