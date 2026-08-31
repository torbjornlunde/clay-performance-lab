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
