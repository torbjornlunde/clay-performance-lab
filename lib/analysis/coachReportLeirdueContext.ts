import { normalizeDisciplineGroup, type LeirdueResultRow } from "./coachReportEvidence";

export type CoachReportLeirdueCompetitionContext = { id: string; name?: string | null; discipline?: string | null; competition_date?: string | null; shooting_ground?: string | null; leirdue_result_url?: string | null; event_id?: string | null; liste_id?: string | null };
export type CoachReportLeirdueContextResult = { status: "available" | "unavailable"; rows: LeirdueResultRow[]; errors: string[] };

type SupabaseLike = { from(table: string): any };
type QuerySpec = { table: "leirdue_shared_shooter_results" | "leirdue_parsed_result_cache"; filters: Record<string, string>; sessionId: string };

const PAGE_SIZE = 1000;
function clean(value: unknown) { return String(value ?? "").trim(); }
function lower(value: unknown) { return clean(value).toLowerCase(); }
function sessionDate(session: CoachReportLeirdueCompetitionContext) { return String(session.competition_date || "").slice(0, 10); }
function conservativeTextMatch(row: LeirdueResultRow, session: CoachReportLeirdueCompetitionContext) { const title = lower(row.event_title); const name = lower(session.name); const organizer = lower(row.organizer); const ground = lower(session.shooting_ground); return Boolean((title && name && (title.includes(name) || name.includes(title))) || (organizer && ground && (organizer.includes(ground) || ground.includes(organizer)))); }
function disciplineMatches(row: LeirdueResultRow, session: CoachReportLeirdueCompetitionContext) { return !row.discipline || !session.discipline || normalizeDisciplineGroup(row.discipline) === normalizeDisciplineGroup(session.discipline); }
function eventKey(row: LeirdueResultRow) { return [clean(row.event_id), clean(row.liste_id), clean(row.source_url), String(row.event_date || "").slice(0, 10), lower(row.event_title), normalizeDisciplineGroup(row.discipline)].join("|"); }
function resultKey(row: LeirdueResultRow) { const score = typeof row.score === "number" ? row.score : row.own_score; return [eventKey(row), lower(row.normalized_name || row.original_name), score ?? "", row.placement ?? ""].join("|"); }

export function mapSharedLeirdueRow(row: any): LeirdueResultRow { return { event_id: row.event_id ?? null, liste_id: row.liste_id ?? null, normalized_name: row.normalized_name ?? null, original_name: row.original_name ?? null, club: row.club ?? null, placement: row.placement ?? null, score: row.score ?? null, total_targets: row.total_targets ?? null, winning_score: row.winning_score ?? null, discipline: row.discipline ?? null, event_date: row.event_date ?? null, event_title: row.event_title ?? null, organizer: row.organizer ?? null, source_url: row.source_url ?? null, validation_status: row.validation_status ?? null }; }
export function mapParsedCacheLeirdueRow(row: any): LeirdueResultRow { return { event_id: row.event_id ?? null, liste_id: row.liste_id ?? null, normalized_name: row.shooter_name_normalized ?? null, original_name: row.shooter_name_display ?? null, club: row.club ?? null, placement: row.placement ?? null, own_score: row.own_score ?? null, total_targets: row.total_targets ?? null, winning_score: row.winning_score ?? null, discipline: row.discipline ?? null, event_date: row.event_date ?? null, event_title: row.event_title ?? null, organizer: row.organizer ?? null, source_url: row.source_url ?? null }; }

function selectFor(table: QuerySpec["table"]) { return table === "leirdue_shared_shooter_results" ? "event_id,liste_id,normalized_name,original_name,club,placement,score,total_targets,winning_score,discipline,event_date,event_title,organizer,source_url,validation_status" : "event_id,liste_id,shooter_name_normalized,shooter_name_display,club,placement,own_score,total_targets,winning_score,discipline,event_date,event_title,organizer,source_url"; }
function mapFor(table: QuerySpec["table"], row: any) { return table === "leirdue_shared_shooter_results" ? mapSharedLeirdueRow(row) : mapParsedCacheLeirdueRow(row); }

async function fetchAllRows(supabase: SupabaseLike, spec: QuerySpec) {
  const rows: LeirdueResultRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase.from(spec.table).select(selectFor(spec.table)).range(from, from + PAGE_SIZE - 1);
    for (const [key, value] of Object.entries(spec.filters)) query = query.eq(key, value);
    const { data, error } = await query;
    if (error) throw new Error(`Could not load Leirdue ${spec.table} context for ${spec.sessionId}.`);
    const page = (data || []).map((row: any) => mapFor(spec.table, row));
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

function eventSpecsForMatchedRow(row: LeirdueResultRow, sessionId: string): QuerySpec[] { const specs: QuerySpec[] = []; for (const table of ["leirdue_shared_shooter_results", "leirdue_parsed_result_cache"] as const) { if (row.event_id) specs.push({ table, sessionId, filters: row.liste_id ? { event_id: row.event_id, liste_id: row.liste_id } : { event_id: row.event_id } }); else if (row.source_url) specs.push({ table, sessionId, filters: { source_url: row.source_url } }); } return specs; }

export async function fetchCoachReportLeirdueContext(supabase: SupabaseLike, sessions: CoachReportLeirdueCompetitionContext[]): Promise<CoachReportLeirdueContextResult> {
  const competitions = sessions.filter((session) => lower((session as any).session_type) === "competition" || session.leirdue_result_url || session.event_id || sessionDate(session));
  const matchedRows: LeirdueResultRow[] = [];
  const errors: string[] = [];
  for (const session of competitions) {
    try {
      const candidateSpecs: QuerySpec[] = [];
      if (session.leirdue_result_url) for (const table of ["leirdue_shared_shooter_results", "leirdue_parsed_result_cache"] as const) candidateSpecs.push({ table, sessionId: session.id, filters: { source_url: session.leirdue_result_url } });
      else if (session.event_id) for (const table of ["leirdue_shared_shooter_results", "leirdue_parsed_result_cache"] as const) candidateSpecs.push({ table, sessionId: session.id, filters: session.liste_id ? { event_id: session.event_id, liste_id: session.liste_id } : { event_id: session.event_id } });
      else if (sessionDate(session)) for (const table of ["leirdue_shared_shooter_results", "leirdue_parsed_result_cache"] as const) candidateSpecs.push({ table, sessionId: session.id, filters: { event_date: sessionDate(session) } });
      const candidates = (await Promise.all(candidateSpecs.map((spec) => fetchAllRows(supabase, spec)))).flat().filter((row) => disciplineMatches(row, session) && (session.leirdue_result_url || session.event_id || conservativeTextMatch(row, session)));
      const eventSpecs = new Map<string, QuerySpec>();
      for (const row of candidates) for (const spec of eventSpecsForMatchedRow(row, session.id)) eventSpecs.set(`${spec.table}:${JSON.stringify(spec.filters)}`, spec);
      const eventRows = (await Promise.all([...eventSpecs.values()].map((spec) => fetchAllRows(supabase, spec)))).flat().filter((row) => disciplineMatches(row, session));
      matchedRows.push(...eventRows);
    } catch (error: any) { errors.push(error?.message || `Could not load Leirdue context for ${session.id}.`); }
  }
  const deduped = [...new Map(matchedRows.map((row) => [resultKey(row), row])).values()];
  return { status: errors.length ? "unavailable" : "available", rows: deduped, errors };
}

export const __test = { eventKey, resultKey, PAGE_SIZE };
