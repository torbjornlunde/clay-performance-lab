export type ClayArenaMatchStatus = "matched_to_you" | "possible_match" | "no_match";

export type ClayArenaCandidate = {
  provider: "ClayArena";
  sourceUrl: string;
  competitionId: string;
  resultIdentity: string;
  competition: string;
  date: string | null;
  discipline: string;
  venue: string | null;
  shooterName: string;
  country: string | null;
  competitorNumber: string | null;
  category: string | null;
  placement: number | null;
  ownScore: number;
  totalTargets: number | null;
  winningScore: number | null;
  seriesScores: number[];
  shootOff: number | null;
  matchStatus: ClayArenaMatchStatus;
  warnings: string[];
};
