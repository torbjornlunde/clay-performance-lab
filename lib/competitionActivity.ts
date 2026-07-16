export type CompetitionActivitySession = {
  id: string;
  session_type: string | null;
  total_targets?: number | null;
  competition_date?: string | null;
  created_at: string;
  leirdue_result_url?: string | null;
  notes?: string | null;
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

function importDetail(session: CompetitionActivitySession, key: string) {
  if (typeof session.notes !== "string") return null;
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = session.notes.match(new RegExp(`(?:^|\\. )${escapedKey}:\\s*([\\s\\S]*?)(?=\\. [a-z_]+:|$)`, "i"));
  return match?.[1]?.trim() || null;
}

function normalizedLeirdueUrl(session: CompetitionActivitySession) {
  const raw = session.leirdue_result_url || importDetail(session, "source_url");
  if (!raw || !/^https?:\/\/(www\.)?leirdue\.net\//i.test(raw)) return null;
  try {
    const url = new URL(raw);
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";
    url.searchParams.sort();
    return url.toString().replace(/\/$/, "");
  } catch {
    return raw.trim().replace(/\/$/, "");
  }
}

function canonicalCompetitionSessions(sessions: CompetitionActivitySession[]) {
  const byLeirdueUrl = new Set<string>();
  const rows: CompetitionActivitySession[] = [];
  for (const session of sessions) {
    if (session.session_type !== "Competition") continue;
    const leirdueUrl = normalizedLeirdueUrl(session);
    if (leirdueUrl) {
      if (byLeirdueUrl.has(leirdueUrl)) continue;
      byLeirdueUrl.add(leirdueUrl);
    }
    rows.push(session);
  }
  return rows;
}

export function buildCompetitionActivitySummary(
  sessions: CompetitionActivitySession[],
  selectedYear: number,
): CompetitionActivitySummary {
  const competitions = canonicalCompetitionSessions(sessions);
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
