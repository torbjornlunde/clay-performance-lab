"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type AppearanceMode = "system" | "light" | "dark";

const STORAGE_KEY = "cpl-appearance";

type ThemeContextValue = {
  mode: AppearanceMode;
  resolvedTheme: "light" | "dark";
  setMode: (mode: AppearanceMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(mode: AppearanceMode, systemTheme = getSystemTheme()) {
  const resolvedTheme = mode === "system" ? systemTheme : mode;
  document.documentElement.dataset.appearance = mode;
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.style.colorScheme = resolvedTheme;
  return resolvedTheme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<AppearanceMode>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    let storedMode: AppearanceMode | null = null;
    try {
      storedMode = window.localStorage.getItem(STORAGE_KEY) as AppearanceMode | null;
    } catch {
      storedMode = null;
    }
    const nextMode: AppearanceMode = storedMode === "light" || storedMode === "dark" ? storedMode : "system";
    setModeState(nextMode);
    setResolvedTheme(applyTheme(nextMode));
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      if (mode === "system") setResolvedTheme(applyTheme("system", media.matches ? "light" : "dark"));
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [mode]);

  function setMode(nextMode: AppearanceMode) {
    try {
      if (nextMode === "system") window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, nextMode);
    } catch {
      // Persistence may be blocked, but the current-session theme switch should still work.
    }
    setModeState(nextMode);
    setResolvedTheme(applyTheme(nextMode));
  }

  const value = useMemo(() => ({ mode, resolvedTheme, setMode }), [mode, resolvedTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
