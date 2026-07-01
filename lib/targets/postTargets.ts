export type PresentationType = "single" | "report_pair" | "simultaneous_pair" | "other_pair" | "unknown";
export type TargetDescription = { target_label: string; target_type: string; direction: string; speed: string; distance: string; difficulty: string; notes: string };
export type PostTarget = TargetDescription & { target_position: number; position_in_presentation: number };
export type Presentation = { presentation_number: number; presentation_type: PresentationType; targets: PostTarget[] };
export type PostTargets = { post_number: number; presentations: Presentation[] };
export type Draft = { schemaVersion: 1; sessionId: string; postCount: number; posts: PostTargets[]; lastLocalUpdateAt: string; lastServerSyncAt?: string; hasUnsyncedChanges: boolean };
export const presentationLabels: Record<PresentationType, string> = { single: "Single", report_pair: "Report pair", simultaneous_pair: "Simultaneous pair", other_pair: "Other pair", unknown: "Unknown single or pair" };
export const targetTypes = ["Unknown","Crossing","Incoming","Going away","Rising","Dropping","Rabbit","Looper","Teal","Battue","Overhead","Other"];
export const directions = ["Unknown","Left to right","Right to left","Incoming","Going away","Quartering left","Quartering right","Overhead","Other"];
export const speeds = ["Unknown","Slow","Medium","Fast"];
export const distances = ["Unknown","Close","Medium","Long"];
export const difficulties = ["Unknown","Easy","Medium","Hard","Tricky"];
export function targetCountFor(type: PresentationType) { return type === "single" || type === "unknown" ? 1 : 2; }
export function defaultTargetLabel(positionInPresentation: number) { return positionInPresentation === 1 ? "A" : positionInPresentation === 2 ? "B" : ""; }
export function blankTarget(target_position: number, position_in_presentation: number): PostTarget { return { target_position, position_in_presentation, target_label: defaultTargetLabel(position_in_presentation), target_type: "Unknown", direction: "Unknown", speed: "Unknown", distance: "Unknown", difficulty: "Unknown", notes: "" }; }
export function isDescribed(t: TargetDescription) { return [t.target_type,t.direction,t.speed,t.distance,t.difficulty].some((v)=>v && v !== "Unknown") || Boolean(t.target_label?.trim()) || Boolean(t.notes?.trim()); }
export function normalizePost(post_number: number, presentations: Presentation[]): PostTargets {
  let position = 1;
  const normalizedPresentations = presentations.map((p, i) => {
    const targets = Array.from({ length: targetCountFor(p.presentation_type) }, (_, idx) => {
      const positionInPresentation = idx + 1;
      const oldTarget = p.targets[idx] || {};
      return { ...blankTarget(position + idx, positionInPresentation), ...oldTarget, target_position: position + idx, position_in_presentation: positionInPresentation };
    });
    position += targets.length;
    return { presentation_number: i + 1, presentation_type: p.presentation_type, targets };
  });
  return { post_number, presentations: normalizedPresentations };
}
export function emptyPosts(count: number): PostTargets[] { return Array.from({ length: count }, (_, i) => ({ post_number: i + 1, presentations: [] })); }
export function ensurePostCount(posts: PostTargets[], count: number) { return Array.from({ length: count }, (_, i) => normalizePost(i + 1, posts[i]?.presentations || [])); }
export function template(type: "report"|"simultaneous"|"singles"): Presentation[] { const ptype: PresentationType = type === "report" ? "report_pair" : type === "simultaneous" ? "simultaneous_pair" : "single"; return normalizePost(1, Array.from({ length: type === "singles" ? 10 : 5 }, (_, i) => ({ presentation_number: i+1, presentation_type: ptype, targets: [] }))).presentations; }
export function rowsFromPosts(sessionId: string, posts: PostTargets[]) { return posts.flatMap((post) => post.presentations.flatMap((p) => p.targets.map((t) => ({ session_id: sessionId, post_number: post.post_number, target_position: t.target_position, presentation_number: p.presentation_number, presentation_type: p.presentation_type, position_in_presentation: t.position_in_presentation, target_label: t.target_label.trim() || null, target_type: t.target_type, direction: t.direction, speed: t.speed, distance: t.distance, difficulty: t.difficulty, notes: t.notes.trim() || null, updated_at: new Date().toISOString() })))); }
