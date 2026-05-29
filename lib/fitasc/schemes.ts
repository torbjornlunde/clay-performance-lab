import {
  getAllSchemeNumbers,
  getCompakEvent,
  getCompakSchemeOptions,
  getCompakSchemeType,
  getMachineLabel,
  hasVerifiedSchemeData,
} from "./compakSchemes";

export { getAllSchemeNumbers, getCompakEvent, getCompakSchemeType, getMachineLabel, hasVerifiedSchemeData };

export function getSchemeType(scheme: number | null) {
  return getCompakSchemeType(scheme);
}

export function getSchemeOptions() {
  return getCompakSchemeOptions();
}

export function getTargetTypeForScheme(scheme: number | null, targetNumber: number) {
  const event = getCompakEvent(scheme, 1, targetNumber);
  if (event.targetType === "Report pair") return "Report double";
  if (event.targetType === "Simo pair") return "Simo double";
  return event.targetType;
}

export function defaultStartPlateForShooter(n: number) {
  return n >= 1 && n <= 5 ? n : 1;
}

export function plateRotation(start: number) {
  return Array.from({ length: 5 }, (_, i) => ((start - 1 + i) % 5) + 1);
}
