export type LeirdueConfidence = "high" | "medium" | "low";
export type LeirdueCategory = "recommended" | "review" | "control";

export type LeirdueCandidate = {
  date: string;
  name: string;
  shootingGround: string;
  discipline: string;
  ownScore: number;
  totalTargets: number;
  winningScore: number;
  leirdueUrl: string;
  listType: string;
  confidence: LeirdueConfidence;
  notes: string;
  category: LeirdueCategory;
  importRecommended: boolean;
  alreadyImported?: boolean;
};
