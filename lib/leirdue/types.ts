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
  eventPagesFetched: number;
  eventInfoPagesFetched: number;
  eventResultMenuPagesFetched: number;
  listeIdLinksExtracted: number;
  listeIdLinksFromResultMenus: number;
  listeIdPagesFetched: number;
  listeIdShooterPagesFound: number;
  firstListeIdUrlsInspected: string[];
  firstShooterMatchUrls: string[];
  listInspectionLimitReached: boolean;
  resultMenuDiagnostics: { eventUrl: string; contains: Record<string, boolean>; snippet: string }[];
  validationUrlsInspected: number;
  validationShooterMatches: number;
  candidateCategoryCounts: Record<LeirdueCategory, number>;
  candidateConfidenceCounts: Record<LeirdueConfidence, number>;
  duplicatesRemoved: number;
  candidatesWithOwnScore: number;
  candidatesWithWinningScore: number;
  candidatesWithTotalTargets: number;
  candidatesWithShootingGround: number;
  pagesInspected: number;
  shooterPagesFound: number;
  candidateRowsCreated: number;
  rejectedReasons: string[];
  candidateReasons: string[];
  firstUsefulSnippet: string | null;
};

export type LeirdueSearchResult = {
  candidates: LeirdueCandidate[];
  debug: LeirdueSearchDebug;
};
