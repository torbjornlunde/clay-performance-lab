export type LeirdueConfidence = "high" | "medium" | "low";
export type LeirdueCategory = "recommended" | "review" | "control";

export type LeirdueCandidate = {
  date: string | null;
  name: string;
  shootingGround: string | null;
  discipline: string;
  ownScore: number | null;
  totalTargets: number | null;
  winningScore: number | null;
  leirdueUrl: string;
  listType: string | null;
  confidence: LeirdueConfidence;
  notes: string;
  category: LeirdueCategory;
  importRecommended: boolean;
  alreadyImported?: boolean;
};

export type LeirdueFetchDebug = {
  url: string;
  status: number | null;
  ok: boolean;
  note?: string;
};

export type LeirdueSearchDebug = {
  fetchedUrls: LeirdueFetchDebug[];
  eventLinksFound: number;
  resultLinksFound: number;
  pagesInspected: number;
  shooterPagesFound: number;
  candidateRowsCreated: number;
  rejectedReasons: string[];
  firstUsefulSnippet: string | null;
};

export type LeirdueSearchResult = {
  candidates: LeirdueCandidate[];
  debug: LeirdueSearchDebug;
};
