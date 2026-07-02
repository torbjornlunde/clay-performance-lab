import { isCompactDiscipline, isOrdinaryLeirduesti, isPostBasedSportingDiscipline } from "@/lib/disciplines";
import { normalizePhysicalTargetsForTemplate, normalizePostTargetsForTemplate, normalizeTargetDetails } from "@/lib/targets/targetDetails";

export type TemplateVisibility = "private" | "link" | "searchable";
export const TEMPLATE_PAYLOAD_VERSION = 1;
export const TEMPLATE_VISIBILITIES: TemplateVisibility[] = ["private", "link", "searchable"];
export function normalizeSearchText(value: string | null | undefined) { return (value || "").trim().toLowerCase().replace(/\s+/g, " "); }
export function creatorLabel(row: { show_creator_name?: boolean | null; creator_display_name_snapshot?: string | null }) { return row.show_creator_name && row.creator_display_name_snapshot ? `Created by ${row.creator_display_name_snapshot}` : "Created by another user"; }
export function supportedTemplateDiscipline(discipline: string | null | undefined) { return Boolean(discipline && (isCompactDiscipline(discipline) || discipline === "Sporttrap" || isPostBasedSportingDiscipline(discipline) || isOrdinaryLeirduesti(discipline))); }
export function disciplineSupportNote(discipline: string | null | undefined) {
  if (!discipline) return "No discipline selected.";
  if (isPostBasedSportingDiscipline(discipline) || isOrdinaryLeirduesti(discipline)) return "Full post/stand presentation structure from session_post_targets can be published and copied.";
  if (isCompactDiscipline(discipline) || discipline === "Sporttrap") return "Physical machine target definitions and course/program metadata can be published and copied.";
  if (discipline === "FITASC Sporting") return "FITASC Sporting setup sharing is not supported in this PR. Discipline-specific FITASC template support will come later.";
  return "This discipline is not supported for competition templates yet.";
}
export function publicFields() { return ["name", "competition_date", "shooting_ground", "discipline", "post_count", "target_count", "is_complete", "template_version", "template_payload", "visibility", "show_creator_name", "creator_display_name_snapshot"] as const; }
export function forbiddenPayloadKeys() { return ["score", "miss", "misses", "reason", "notes_private", "equipment", "weapon", "ammunition", "lens", "coach", "participant", "shooter_name", "email", "user_id", "owner_user_id", "source_session_id", "session_id", "id"]; }
function scanForbidden(value: unknown): string[] { const found = new Set<string>(); const walk = (v: any) => { if (!v || typeof v !== "object") return; for (const key of Object.keys(v)) { const lower = key.toLowerCase(); if (forbiddenPayloadKeys().some((f) => lower === f || lower.includes(f))) found.add(key); walk(v[key]); } }; walk(value); return [...found]; }
export function assertSafeTemplatePayload(payload: unknown) { const found = scanForbidden(payload); if (found.length) throw new Error(`Template payload contains non-publishable fields: ${found.join(", ")}`); return true; }
export function buildTemplatePayload(args: { session: any; courses?: any[]; postTargets?: any[]; postDetails?: any[]; targetDefinitions?: any[] }) {
  const { session } = args;
  const coursePayload = (args.courses || []).map((course) => ({ courseNumber: Number(course.course_number), fitascScheme: course.fitasc_scheme ?? null, shooterNumber: course.shooter_number ?? null, startPlate: course.start_plate ?? null }));
  let setup: any;
  if (isPostBasedSportingDiscipline(session.discipline) || isOrdinaryLeirduesti(session.discipline)) {
    const byPost = new Map<number, any[]>();
    for (const row of args.postTargets || []) { const post = Number(row.post_number); byPost.set(post, [...(byPost.get(post) || []), row]); }
    const detailByPost = new Map((args.postDetails || []).map((row) => [Number(row.post_number), row]));
    const posts = [...byPost.entries()].sort((a,b)=>a[0]-b[0]).map(([postNumber, rows]) => {
      const byPresentation = new Map<number, any[]>();
      rows.sort((a,b)=>Number(a.target_position)-Number(b.target_position)).forEach((row) => { const p = Number(row.presentation_number); byPresentation.set(p, [...(byPresentation.get(p)||[]), row]); });
      const detail = detailByPost.get(postNumber) as any;
      return { post_number: postNumber, instructions: detail?.instructions || "", source_text: detail?.source_text || "", presentations: [...byPresentation.entries()].sort((a,b)=>a[0]-b[0]).map(([presentationNumber, targets]) => ({ presentation_number: presentationNumber, presentation_type: targets[0]?.presentation_type || "unknown", targets })) };
    });
    setup = normalizePostTargetsForTemplate(session.discipline, posts);
    setup.posts = setup.posts.map((post: any) => ({ ...post, instructions: (posts.find((p:any)=>p.post_number===post.postNumber)?.instructions || "").trim(), sourceText: (posts.find((p:any)=>p.post_number===post.postNumber)?.source_text || "").trim() }));
  } else {
    setup = normalizePhysicalTargetsForTemplate(session.discipline, args.targetDefinitions || [], { courses: coursePayload, shootingFormat: session.shooting_format || null, sporttrapSeriesCount: session.sporttrap_series_count || null });
    setup.physicalTargets = (args.targetDefinitions || []).map((row) => ({ courseNumber: Number(row.course_number), machine: String(row.machine), details: normalizeTargetDetails({ label: row.machine, targetType: row.target_type, direction: row.direction, angle: row.angle, speed: row.speed, distance: row.distance, difficulty: row.difficulty, notes: row.notes }) }));
  }
  const targetCount = isPostBasedSportingDiscipline(session.discipline) || isOrdinaryLeirduesti(session.discipline) ? setup.posts.reduce((sum: number, p: any) => sum + p.presentations.reduce((s: number, pr: any) => s + pr.targets.length, 0), 0) : Number(session.total_targets || (session.sporttrap_series_count ? session.sporttrap_series_count * 25 : (session.course_count || 0) * 25));
  const postCount = Number(session.post_count || session.course_count || setup.posts?.length || coursePayload.length || 0);
  const isComplete = postCount > 0 && targetCount > 0 && (isPostBasedSportingDiscipline(session.discipline) || isOrdinaryLeirduesti(session.discipline) ? setup.posts.length >= postCount : (args.targetDefinitions || []).length > 0);
  const payload = { schemaVersion: TEMPLATE_PAYLOAD_VERSION, metadata: { name: session.name, competitionDate: session.competition_date, shootingGround: session.shooting_ground, discipline: session.discipline, shootingFormat: session.shooting_format || null, postCount, targetCount, defaultPostFormat: session.default_post_format || null }, setup };
  assertSafeTemplatePayload(payload);
  return { payload, postCount, targetCount, isComplete };
}
