"use client";

import { useAppBack } from "./AppNavigationProvider";

export function AppBackButton({ fallback = "/dashboard", label = "Back" }: { fallback?: string; label?: string }) {
  const { goBack } = useAppBack();
  return <button type="button" className="button secondary smallButton appBackButton" onClick={() => goBack(fallback)} aria-label={label}>{label}</button>;
}
