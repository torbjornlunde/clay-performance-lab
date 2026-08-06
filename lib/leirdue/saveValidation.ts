import type { LeirdueCandidate } from "@/lib/leirdue/types";
import { validateLeirdueReviewedCandidate } from "./review";

export function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isLeirdueSaveCandidate(value: unknown): value is LeirdueCandidate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LeirdueCandidate>;
  return Boolean(
    typeof candidate.date === "string" &&
      candidate.date.trim() &&
      typeof candidate.name === "string" &&
      candidate.name.trim() &&
      typeof candidate.discipline === "string" &&
      candidate.discipline.trim() &&
      typeof candidate.leirdueUrl === "string" &&
      validateLeirdueReviewedCandidate(candidate as LeirdueCandidate).valid,
  );
}

export function leirdueWinningScoreForInsert(value: unknown) {
  return numberOrNull(value);
}
