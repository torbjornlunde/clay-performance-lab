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

function calendarYearFromDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year <= 0 || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const utcDate = new Date(Date.UTC(year, month - 1, day));
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    return null;
  }

  return year;
}

function utcYearFromTimestamp(value: string) {
  const date = new Date(value);
  const year = Number.isFinite(date.getTime()) ? date.getUTCFullYear() : null;
  return year && year > 0 ? year : null;
}

function yearForSession(session: CompetitionActivitySession) {
  if (session.competition_date) return calendarYearFromDateOnly(session.competition_date);
  return utcYearFromTimestamp(session.created_at);
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
