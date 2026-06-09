import type { LeirdueCandidate, LeirdueDuplicateMatch } from "@/lib/leirdue/types";
import { extractLeirdueSourceIdentifiers, namesLikelyMatch, normalizeLeirdueName } from "@/lib/leirdue/normalize";

export type LeirdueDuplicateSessionRow = {
  id: string;
  name: string | null;
  discipline: string | null;
  competition_date: string | null;
  own_score: number | null;
  total_targets: number | null;
  winning_score: number | null;
  leirdue_result_url: string | null;
  notes: string | null;
};

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sameNumber(first: unknown, second: unknown) {
  const firstNumber = numberOrNull(first);
  const secondNumber = numberOrNull(second);
  return firstNumber !== null && secondNumber !== null && firstNumber === secondNumber;
}

function sessionHasLeirdueSource(row: LeirdueDuplicateSessionRow) {
  return Boolean(row.leirdue_result_url) || /source:\s*leirdue_net|Leirdue import/i.test(row.notes || "");
}

export function compareLeirdueDuplicate(candidate: LeirdueCandidate, row: LeirdueDuplicateSessionRow): LeirdueDuplicateMatch | null {
  const candidateIds = extractLeirdueSourceIdentifiers(candidate.leirdueUrl);
  const rowIds = extractLeirdueSourceIdentifiers(row.leirdue_result_url);
  const sameUrl = Boolean(candidate.leirdueUrl && row.leirdue_result_url && candidate.leirdueUrl === row.leirdue_result_url);
  const sameSourceIds = Boolean(candidateIds.stevneId && candidateIds.listeId && candidateIds.stevneId === rowIds.stevneId && candidateIds.listeId === rowIds.listeId);

  if (sameUrl || sameSourceIds) {
    return { id: row.id, exact: true, reason: sameUrl ? "Duplicate reason: same Leirdue source URL." : "Duplicate reason: same source stevne_id + liste_id + shooter + score." };
  }

  const sameDate = Boolean(candidate.date && row.competition_date === candidate.date);
  const sameDiscipline = normalizeLeirdueName(row.discipline || "") === normalizeLeirdueName(candidate.discipline || "");
  const sameEvent = namesLikelyMatch(row.name, candidate.name);
  const sameOwnScore = sameNumber(row.own_score, candidate.ownScore);
  const sameTotalTargets = sameNumber(row.total_targets, candidate.totalTargets);
  const sameWinningScore = sameNumber(row.winning_score, candidate.winningScore);

  if (sameDate && sameDiscipline && sameEvent && sameOwnScore) {
    return { id: row.id, exact: sessionHasLeirdueSource(row) && sameTotalTargets && sameWinningScore, reason: "Possible duplicate: same date + discipline + shooter + total score." };
  }

  if (sameDate && sameDiscipline && sameOwnScore && (sameEvent || sameTotalTargets || sameWinningScore)) {
    return { id: row.id, exact: false, reason: "Possible duplicate: same date + discipline + total score with overlapping event data." };
  }

  return null;
}
