import {
  COMPAK_SPORTING,
  KOMPAKT_LEIRDUESTI,
  SPORTTRAP,
  canonicalizeDiscipline,
} from "@/lib/disciplines";

export type CompetitionResultClaim = {
  score_sheet_id: string;
  shooter_id: string;
  event_title: string;
  event_date: string;
  location: string | null;
  discipline: string;
  shooter_name: string;
  own_score: number;
  expected_targets: number;
  scored_targets: number;
  known_misses: number;
  post_scores: Array<{ post: number; score: number; maximum: number }>;
  finalized_at: string;
  reopen_count: number;
  claimed_session_id: string | null;
  source_changed: boolean;
};

export function claimCoverage(result: CompetitionResultClaim) {
  return {
    complete: result.scored_targets === result.expected_targets || result.post_scores.reduce((sum, row) => sum + row.maximum, 0) === result.expected_targets,
    targetDetailComplete: result.scored_targets === result.expected_targets,
  };
}

export function unclaimedCompetitionResults(results: CompetitionResultClaim[]) {
  return results.filter((result) => !result.claimed_session_id && claimCoverage(result).complete);
}

export function sourceCorrectionLabel(result: CompetitionResultClaim) {
  return result.claimed_session_id && result.source_changed ? "Source result was corrected after you added it" : null;
}

export type ClaimedSessionShape = {
  shootingFormat: "Sporttrap" | "Post-based" | null;
  courseCount: number;
  sporttrapSeriesCount: number | null;
  postCount: number | null;
  targetsPerPost: number | null;
};

/** Mirrors the database claim RPC's discipline-aware personal-session mapping. */
export function claimedSessionShape(discipline: string, numberOfPosts: number, targetsPerPost: number | null, totalTargets: number): ClaimedSessionShape {
  const canonical = canonicalizeDiscipline(discipline);
  if (canonical === COMPAK_SPORTING || canonical === KOMPAKT_LEIRDUESTI) {
    if (totalTargets % 25 !== 0) throw new Error("Compact results must contain complete 25-target courses.");
    return { shootingFormat: null, courseCount: totalTargets / 25, sporttrapSeriesCount: null, postCount: null, targetsPerPost: null };
  }
  if (canonical === SPORTTRAP) {
    if (totalTargets % 25 !== 0) throw new Error("Sporttrap results must contain complete 25-target series.");
    const series = totalTargets / 25;
    return { shootingFormat: "Sporttrap", courseCount: 1, sporttrapSeriesCount: series, postCount: null, targetsPerPost: null };
  }
  return { shootingFormat: "Post-based", courseCount: numberOfPosts, sporttrapSeriesCount: null, postCount: numberOfPosts, targetsPerPost };
}
