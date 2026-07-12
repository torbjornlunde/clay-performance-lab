import { parseLeirdueManualResultLink } from "@/lib/leirdue/parser";
import { extractLeirdueSourceIdentifiers, normalizeLeirdueName } from "@/lib/leirdue/normalize";
import type { LeirdueCandidate } from "@/lib/leirdue/types";

export type LeirdueSourceField = "own_score" | "winning_score" | "total_targets" | "placement" | "name" | "competition_date" | "discipline" | "shooting_ground" | "shooter_class" | "source_url" | "liste_id";
export type LeirdueSourceDiff = { field: LeirdueSourceField; label: string; currentValue: string | number | null; sourceValue: string | number | null; changed: boolean; safeToApply: boolean };
export type LeirdueSourceRefreshStatus = "no_changes" | "changed" | "could_not_match" | "fetch_failed" | "not_linked";

export type LeirdueRefreshSession = {
  id: string;
  name: string | null;
  competition_date: string | null;
  discipline: string | null;
  shooting_ground: string | null;
  own_score: number | null;
  winning_score: number | null;
  total_targets: number | null;
  leirdue_result_url: string | null;
  notes: string | null;
};

export function leirdueImportDetail(notes: string | null | undefined, key: string) {
  if (typeof notes !== "string") return null;
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = notes.match(new RegExp(`(?:^|\\. )${escapedKey}:\\s*([\\s\\S]*?)(?=\\. [a-z_]+:|$)`, "i"));
  return match?.[1]?.trim() || null;
}

export function leirdueSourceUrlForSession(session: LeirdueRefreshSession) {
  const url = session.leirdue_result_url || leirdueImportDetail(session.notes, "source_url");
  return url && /^https?:\/\/(www\.)?leirdue\.net\//i.test(url) ? url : null;
}

function asNumber(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function normText(value: string | null | undefined) { return (value || "").trim().toLowerCase(); }
function eq(a: unknown, b: unknown) { return (a ?? null) === (b ?? null); }
function diff(field: LeirdueSourceField, label: string, currentValue: string | number | null, sourceValue: string | number | null, safeToApply = true): LeirdueSourceDiff {
  return { field, label, currentValue: currentValue ?? null, sourceValue: sourceValue ?? null, changed: !eq(currentValue, sourceValue), safeToApply };
}

export function matchLeirdueSourceCandidate(session: LeirdueRefreshSession, candidates: LeirdueCandidate[]) {
  const savedShooter = leirdueImportDetail(session.notes, "shooter_name");
  const savedClass = leirdueImportDetail(session.notes, "shooter_class");
  const savedPlacement = Number(leirdueImportDetail(session.notes, "placement"));
  const ids = extractLeirdueSourceIdentifiers(leirdueSourceUrlForSession(session) || "");
  const normalizedSavedShooter = normalizeLeirdueName(savedShooter || "");
  let best: { candidate: LeirdueCandidate; score: number } | null = null;
  for (const candidate of candidates) {
    let score = 0;
    if (ids.listeId && candidate.listeId === ids.listeId) score += 2;
    if (normalizedSavedShooter && normalizeLeirdueName(candidate.shooterName || "") === normalizedSavedShooter) score += 5;
    if (Number.isFinite(savedPlacement) && candidate.placement === savedPlacement) score += 2;
    if (session.own_score !== null && candidate.ownScore === session.own_score) score += 2;
    if (session.total_targets !== null && candidate.totalTargets === session.total_targets) score += 1;
    if (session.competition_date && candidate.date === session.competition_date) score += 1;
    if (session.discipline && normText(candidate.discipline) === normText(session.discipline)) score += 1;
    if (savedClass && normText(candidate.shooterClass) === normText(savedClass)) score += 1;
    if (!best || score > best.score) best = { candidate, score };
  }
  return best && best.score >= 6 ? best.candidate : null;
}

export async function refreshLeirdueSource(session: LeirdueRefreshSession) {
  const sourceUrl = leirdueSourceUrlForSession(session);
  if (!sourceUrl) return { status: "not_linked" as const, sourceUrl: null, diffs: [], error: "This saved result is not linked to a Leirdue.net source URL." };
  const year = session.competition_date ? Number(session.competition_date.slice(0, 4)) : null;
  const parsed = await parseLeirdueManualResultLink({ url: sourceUrl, year, selectedDisciplines: session.discipline ? [session.discipline] : undefined });
  if (!parsed.ok) return { status: "fetch_failed" as const, sourceUrl, diffs: [], error: parsed.error || "Could not read the Leirdue.net source." };
  const candidate = matchLeirdueSourceCandidate(session, parsed.candidates);
  if (!candidate) return { status: "could_not_match" as const, sourceUrl, diffs: [], error: "Could not safely match source result." };
  const ids = extractLeirdueSourceIdentifiers(candidate.leirdueUrl || sourceUrl);
  const diffs = [
    diff("own_score", "Own score", asNumber(session.own_score), asNumber(candidate.ownScore)),
    diff("winning_score", "Winning score", asNumber(session.winning_score), asNumber(candidate.winningScore)),
    diff("total_targets", "Total targets", asNumber(session.total_targets), asNumber(candidate.totalTargets)),
    diff("placement", "Placement", Number(leirdueImportDetail(session.notes, "placement")) || null, asNumber(candidate.placement), false),
    diff("name", "Event title", session.name, candidate.name),
    diff("competition_date", "Event date", session.competition_date, candidate.date ?? null),
    diff("discipline", "Discipline", session.discipline, candidate.discipline),
    diff("shooting_ground", "Ground / organizer", session.shooting_ground, candidate.shootingGround ?? null),
    diff("shooter_class", "Class / category", leirdueImportDetail(session.notes, "shooter_class"), candidate.shooterClass ?? null, false),
    diff("source_url", "Source URL", sourceUrl, candidate.leirdueUrl, false),
    diff("liste_id", "Liste id", leirdueImportDetail(session.notes, "liste_id"), ids.listeId, false),
  ];
  return { status: diffs.some((item) => item.changed) ? "changed" as const : "no_changes" as const, sourceUrl, diffs, error: null };
}

export function storedSourceDiffsFromSummary(summary: unknown) {
  if (!summary || typeof summary !== "object") return null;
  const status = (summary as { status?: unknown }).status;
  const diffs = (summary as { diffs?: unknown }).diffs;
  if (status !== "changed" || !Array.isArray(diffs)) return null;
  return diffs.filter((item): item is LeirdueSourceDiff => {
    if (!item || typeof item !== "object") return false;
    const diffItem = item as Partial<LeirdueSourceDiff>;
    return typeof diffItem.field === "string" && typeof diffItem.label === "string" && typeof diffItem.changed === "boolean" && typeof diffItem.safeToApply === "boolean";
  });
}

export function applyableSessionPatch(diffs: LeirdueSourceDiff[], selectedFields: string[]) {
  const allowed = new Set<LeirdueSourceField>(["own_score", "winning_score", "total_targets", "name", "competition_date", "discipline", "shooting_ground"]);
  const selected = new Set(selectedFields);
  const patch: Record<string, string | number | null> = {};
  for (const item of diffs) if (item.changed && item.safeToApply && allowed.has(item.field) && selected.has(item.field)) patch[item.field] = item.sourceValue;
  return patch;
}
