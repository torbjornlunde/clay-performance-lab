import { getAllSchemeNumbers, getCompakSchemeType, getPresentationLabel, getCompakEvent } from "./compakSchemes";

export function getSchemeType(scheme: number) {
  return getCompakSchemeType(scheme);
}

export function getSchemeOptions() {
  return getAllSchemeNumbers().map((scheme) => ({ scheme, label: `Scheme ${scheme} — ${getSchemeType(scheme)}` }));
}

export function getTargetTypeForScheme(scheme: number, targetNumber: number) {
  return getPresentationLabel(getCompakEvent(scheme, 1, targetNumber).presentation);
}

export function defaultStartPlateForShooter(n: number) {
  return n >= 1 && n <= 5 ? n : 1;
}

export function plateRotation(start: number) {
  return Array.from({ length: 5 }, (_, i) => ((start - 1 + i) % 5) + 1);
}
