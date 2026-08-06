import type { LeirdueCandidate, LeirdueParsedValues } from "@/lib/leirdue/types";

export type LeirdueFieldErrors = Partial<Record<"ownScore" | "totalTargets" | "winningScore" | "seriesScores" | "date" | "name" | "discipline", string>>;

function validWhole(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value);
}

export function parsedValues(candidate: LeirdueCandidate): LeirdueParsedValues {
  return candidate.originalParsed || {
    ownScore: candidate.ownScore,
    totalTargets: candidate.totalTargets,
    winningScore: candidate.winningScore,
    seriesScores: [...(candidate.seriesScores || [])],
    date: candidate.date,
    discipline: candidate.discipline,
    name: candidate.name,
    shootingGround: candidate.shootingGround,
  };
}

export function seriesSummary(values: Array<number | null> | undefined) {
  const slots = values || [];
  const known = slots.filter((value): value is number => value !== null);
  return { knownSubtotal: known.reduce((sum, value) => sum + value, 0), partial: slots.length > 0 && known.length < slots.length, complete: slots.length > 0 && known.length === slots.length };
}

export function correctedFieldNames(candidate: LeirdueCandidate) {
  const original = parsedValues(candidate);
  const names: string[] = [];
  const fields = ["ownScore", "totalTargets", "winningScore", "date", "discipline", "name", "shootingGround"] as const;
  fields.forEach((field) => { if ((candidate[field] ?? null) !== (original[field] ?? null)) names.push(field); });
  const reviewed = candidate.reviewedSeriesScores ?? candidate.seriesScores ?? [];
  if (JSON.stringify(reviewed) !== JSON.stringify(original.seriesScores)) names.push("seriesScores");
  return names;
}

export function validateLeirdueReviewedCandidate(candidate: LeirdueCandidate) {
  const errors: LeirdueFieldErrors = {};
  if (!validWhole(candidate.ownScore) || (candidate.ownScore as number) < 0) errors.ownScore = "Own score is required and must be a non-negative whole number.";
  if (!validWhole(candidate.totalTargets) || (candidate.totalTargets as number) <= 0) errors.totalTargets = "Total targets is required and must be a whole number greater than zero.";
  if (!errors.ownScore && !errors.totalTargets && (candidate.ownScore as number) > (candidate.totalTargets as number)) errors.ownScore = "Own score cannot exceed total targets.";
  if (candidate.winningScore !== null && (!validWhole(candidate.winningScore) || candidate.winningScore < 0)) errors.winningScore = "Winning score must be blank or a non-negative whole number.";
  if (!errors.totalTargets && candidate.winningScore !== null && validWhole(candidate.winningScore) && candidate.winningScore > (candidate.totalTargets as number)) errors.winningScore = "Winning score cannot exceed total targets.";
  if (!candidate.date?.trim()) errors.date = "Date is required.";
  if (!candidate.name?.trim()) errors.name = "Competition name is required.";
  if (!candidate.discipline?.trim()) errors.discipline = "Discipline is required.";
  const slots = candidate.reviewedSeriesScores ?? candidate.seriesScores ?? [];
  if (slots.some((value) => value !== null && (!validWhole(value) || value < 0))) errors.seriesScores = "Series scores must be blank or non-negative whole numbers.";
  const summary = seriesSummary(slots);
  if (!errors.ownScore && summary.knownSubtotal > (candidate.ownScore as number)) errors.seriesScores = "Known series subtotal cannot exceed own score.";
  const mismatch = summary.complete && !errors.ownScore && summary.knownSubtotal !== candidate.ownScore;
  if (mismatch && !candidate.seriesMismatchAcknowledged) errors.seriesScores = "Choose Use series total or Keep own score before importing.";
  return { errors, valid: Object.keys(errors).length === 0, series: summary, completeMismatch: mismatch };
}
