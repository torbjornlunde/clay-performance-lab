export type CompetitionActivitySession = {
  id: string;
  session_type: string | null;
  total_targets?: number | null;
  competition_date?: string | null;
  created_at: string;
};

export type CompetitionActivitySummary = {
  allTimeCompetitionCount: number;
  allTimeCompetitionTargetCount: number;
  selectedYearCompetitionCount: number;
  selectedYearCompetitionTargetCount: number;
  years: number[];
  selectedYear: number;
  hasUnknownAllTimeTargets: boolean;
  hasUnknownSelectedYearTargets: boolean;
};

function sessionDateValue(session: CompetitionActivitySession) {
  return session.competition_date || session.created_at;
}

function yearForSession(session: CompetitionActivitySession) {
  const value = sessionDateValue(session);
  const date = value ? new Date(value) : null;
  const year = date && Number.isFinite(date.getTime()) ? date.getFullYear() : null;
  return year && year > 0 ? year : null;
}

function targetCountValue(session: CompetitionActivitySession) {
  return typeof session.total_targets === "number" && Number.isFinite(session.total_targets) && session.total_targets >= 0
    ? session.total_targets
    : null;
}

export function buildCompetitionActivitySummary(
  sessions: CompetitionActivitySession[],
  selectedYear: number,
): CompetitionActivitySummary {
  const competitions = sessions.filter((session) => session.session_type === "Competition");
  const years = Array.from(
    new Set(competitions.map(yearForSession).filter((year): year is number => year !== null)),
  ).sort((a, b) => b - a);
  const selectedYearCompetitions = competitions.filter((session) => yearForSession(session) === selectedYear);

  const sumKnownTargets = (rows: CompetitionActivitySession[]) => rows.reduce((sum, session) => sum + (targetCountValue(session) ?? 0), 0);
  const hasUnknownTargets = (rows: CompetitionActivitySession[]) => rows.some((session) => targetCountValue(session) === null);

  return {
    allTimeCompetitionCount: competitions.length,
    allTimeCompetitionTargetCount: sumKnownTargets(competitions),
    selectedYearCompetitionCount: selectedYearCompetitions.length,
    selectedYearCompetitionTargetCount: sumKnownTargets(selectedYearCompetitions),
    years,
    selectedYear,
    hasUnknownAllTimeTargets: hasUnknownTargets(competitions),
    hasUnknownSelectedYearTargets: hasUnknownTargets(selectedYearCompetitions),
  };
}
