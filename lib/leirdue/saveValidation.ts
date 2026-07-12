import type { LeirdueCandidate } from "@/lib/leirdue/types";

export function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isLeirdueSaveCandidate(value: unknown): value is LeirdueCandidate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LeirdueCandidate>;
  const ownScore = numberOrNull(candidate.ownScore);
  const totalTargets = numberOrNull(candidate.totalTargets);
  return Boolean(
    typeof candidate.date === "string" &&
      candidate.date.trim() &&
      typeof candidate.name === "string" &&
      candidate.name.trim() &&
      typeof candidate.discipline === "string" &&
      candidate.discipline.trim() &&
      ownScore !== null &&
      totalTargets !== null &&
      totalTargets > 0 &&
      ownScore >= 0 &&
      ownScore <= totalTargets,
  );
}

export function leirdueWinningScoreForInsert(value: unknown) {
  return numberOrNull(value);
}
