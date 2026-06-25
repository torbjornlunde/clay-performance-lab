"use client";

import { type AppearanceMode, useTheme } from "./ThemeProvider";

const OPTIONS: Array<{ value: AppearanceMode; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export default function AppearanceControl() {
  const { mode, resolvedTheme, setMode } = useTheme();

  return (
    <section className="subcard appearanceSetting" aria-labelledby="appearance-heading">
      <div>
        <p className="eyebrow">Appearance</p>
        <h3 id="appearance-heading">Theme</h3>
        <p className="small muted">System follows this device. Light and Dark are saved locally on this device.</p>
      </div>
      <div className="appearanceOptions" role="radiogroup" aria-label="Appearance mode">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={mode === option.value ? "appearanceOption active" : "appearanceOption"}
            aria-pressed={mode === option.value}
            onClick={() => setMode(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="small muted">Currently showing {resolvedTheme} theme.</p>
    </section>
  );
}
