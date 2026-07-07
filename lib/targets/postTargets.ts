export type PresentationType = "single" | "report_pair" | "simultaneous_pair" | "other_pair" | "unknown";
export type TargetDescription = { target_label: string; target_type: string; direction: string; angle: string; speed: string; distance: string; difficulty: string; notes: string };
export type PostTarget = TargetDescription & { target_position: number; position_in_presentation: number; legacy_conflict?: boolean; legacy_warning?: string };
export type Presentation = { presentation_number: number; presentation_type: PresentationType; targets: PostTarget[]; target_ids?: string[] };
export type PhysicalTarget = TargetDescription & { id: string; legacy_conflict?: boolean; legacy_warnings?: string[]; legacy_overrides?: Record<string, TargetDescription> };
export type SharedPresentation = { presentation_number: number; presentation_type: PresentationType; target_ids: string[]; legacy_override_keys?: string[] };
export type PostTargets = { post_number: number; instructions: string; source_text: string; presentations: Presentation[]; physicalTargets: PhysicalTarget[]; sharedPresentations: SharedPresentation[]; compatibilityWarnings?: string[] };
export type Draft = { schemaVersion: 3; sessionId: string; postCount: number; targetsPerPost: number; defaultPostFormat: string; posts: PostTargets[]; lastLocalUpdateAt: string; lastServerSyncAt?: string; hasUnsyncedChanges: boolean };
function normalizeDraftTimestamp(value: unknown) { if (typeof value !== "string" || !value.trim()) return undefined; const time = Date.parse(value); if (!Number.isFinite(time) || time <= Date.UTC(1971, 0, 1)) return undefined; return new Date(time).toISOString(); }
export type PostDetailRow = { session_id: string; post_number: number; instructions: string | null; source_text: string | null; updated_at?: string; created_at?: string; id?: string };
export const DRAFT_SCHEMA_VERSION = 3;
export const presentationLabels: Record<PresentationType, string> = { single: "Single", report_pair: "Report pair", simultaneous_pair: "Simultaneous pair", other_pair: "Other pair", unknown: "Unknown single or pair" };
export const targetTypes = ["Unknown","Standard","Midi","Mini","Battue","Rabbit","Rocket","Chandelle","Loop","Teal","Other","Crossing","Incoming","Going away","Rising","Dropping","Looper","Overhead"];
export const directions = ["Unknown","Left to right","Right to left","Incoming","Going away","Rising","Dropping","Straight up","Overhead","Rabbit","Quartering left","Quartering right","Other"];
export const angles = ["Unknown","Straight","Slight left","Slight right","Hard left","Hard right","High","Low","Quartering","Other"];
export const speeds = ["Unknown","Very slow","Slow","Medium","Fast","Very fast"];
export const distances = ["Unknown","Close","Medium","Long"];
export const difficulties = ["Unknown","1 - Easy","2 - Manageable","3 - Medium","4 - Hard","5 - Very hard","Easy","Medium","Hard","Tricky"];
export function targetCountFor(type: PresentationType) { return type === "single" || type === "unknown" ? 1 : 2; }
export function defaultTargetLabel() { return ""; }
export function normalizeTargetLabel(label: string | null | undefined) { return String(label || "").trim().toUpperCase(); }
export function blankDescription(label = ""): TargetDescription { return { target_label: label, target_type: "Unknown", direction: "Unknown", angle: "Unknown", speed: "Unknown", distance: "Unknown", difficulty: "Unknown", notes: "" }; }
export function blankTarget(target_position: number, position_in_presentation: number): PostTarget { return { ...blankDescription(), target_position, position_in_presentation }; }
export function blankPhysicalTarget(id: string, label = ""): PhysicalTarget { return { id, ...blankDescription(normalizeTargetLabel(label)) }; }
export function isDescribed(t: TargetDescription) { return [t.target_type,t.direction,t.angle,t.speed,t.distance,t.difficulty].some((v)=>v && v !== "Unknown") || Boolean(t.notes?.trim()); }
export function postHasMeaningfulData(post: PostTargets) { return Boolean(post.instructions?.trim() || post.source_text?.trim() || post.presentations.length || post.sharedPresentations?.length || post.physicalTargets?.some((t)=>normalizeTargetLabel(t.target_label) || isDescribed(t)) || post.presentations.some((p) => p.targets.some(isDescribed))); }
function mergeCompatible(base: TargetDescription, next: TargetDescription) { const out = { ...base }; let conflict = false; (['target_type','direction','angle','speed','distance','difficulty','notes'] as const).forEach((field) => { const a = (out[field] || (field === 'notes' ? '' : 'Unknown')).trim(); const b = (next[field] || (field === 'notes' ? '' : 'Unknown')).trim(); const emptyA = !a || a === 'Unknown'; const emptyB = !b || b === 'Unknown'; if (emptyA && !emptyB) (out as any)[field] = b; else if (!emptyA && !emptyB && a !== b) conflict = true; }); return { value: out, conflict }; }
export function rehydrateSharedPost(post: Omit<PostTargets, 'physicalTargets'|'sharedPresentations'> & Partial<PostTargets>): PostTargets {
  const physicalTargets: PhysicalTarget[] = [];
  const warnings: string[] = [];
  const byLabel = new Map<string, PhysicalTarget>();
  const sharedPresentations: SharedPresentation[] = (post.presentations || []).map((presentation) => {
    const overrideKeys: string[] = [];
    const ids = presentation.targets.map((target) => {
      const label = normalizeTargetLabel(target.target_label);
      const desc: TargetDescription = { target_label: label || target.target_label || "", target_type: target.target_type || "Unknown", direction: target.direction || "Unknown", angle: target.angle || "Unknown", speed: target.speed || "Unknown", distance: target.distance || "Unknown", difficulty: target.difficulty || "Unknown", notes: target.notes || "" };
      if (!label) { const id = `legacy-unassigned-${presentation.presentation_number}-${target.position_in_presentation}-${target.target_position}`; physicalTargets.push({ id, ...desc, target_label: "", legacy_warnings: [`Unassigned target in presentation ${presentation.presentation_number} needs review.`] }); warnings.push(`Presentation ${presentation.presentation_number} has an unassigned target needing review.`); overrideKeys[target.position_in_presentation - 1] = `${presentation.presentation_number}:${target.position_in_presentation}`; return id; }
      const existing = byLabel.get(label);
      if (!existing) { const pt = { id: `target-${label}`, ...desc }; byLabel.set(label, pt); physicalTargets.push(pt); return pt.id; }
      const merged = mergeCompatible(existing, desc);
      if (merged.conflict) { existing.legacy_conflict = true; existing.legacy_warnings = Array.from(new Set([...(existing.legacy_warnings || []), `Target ${label} has different saved details in presentation ${presentation.presentation_number}.`])); const overrideKey = `${presentation.presentation_number}:${target.position_in_presentation}`; existing.legacy_overrides = { ...(existing.legacy_overrides || {}), [overrideKey]: desc }; overrideKeys[target.position_in_presentation - 1] = overrideKey; warnings.push(`Target ${label} has different saved details in presentation ${presentation.presentation_number}.`); } else Object.assign(existing, merged.value);
      return existing.id;
    });
    return { presentation_number: presentation.presentation_number, presentation_type: presentation.presentation_type, target_ids: ids, legacy_override_keys: overrideKeys };
  });
  return normalizeSharedPost(post.post_number, physicalTargets, sharedPresentations, post.instructions, post.source_text, warnings);
}
export function normalizeSharedPost(post_number: number, physicalTargets: PhysicalTarget[] = [], sharedPresentations: SharedPresentation[] = [], instructions = "", source_text = "", compatibilityWarnings: string[] = []): PostTargets {
  const normalizedShared = sharedPresentations.map((p, i) => ({
    presentation_number: i + 1,
    presentation_type: p.presentation_type,
    target_ids: Array.from({ length: targetCountFor(p.presentation_type) }, (_, idx) => p.target_ids[idx] || ""),
    legacy_override_keys: Array.from({ length: targetCountFor(p.presentation_type) }, (_, idx) => {
      const key = p.legacy_override_keys?.[idx] || "";
      return key === `${i + 1}:${idx + 1}` ? key : "";
    }),
  }));
  const activeKeysByTarget = new Map<string, Set<string>>();
  normalizedShared.forEach((presentation) => presentation.target_ids.forEach((targetId, idx) => {
    const key = presentation.legacy_override_keys?.[idx];
    if (!targetId || !key) return;
    if (!activeKeysByTarget.has(targetId)) activeKeysByTarget.set(targetId, new Set());
    activeKeysByTarget.get(targetId)!.add(key);
  }));
  const unique: PhysicalTarget[] = [];
  const seen = new Set<string>();
  const cleanedWarnings = new Set(compatibilityWarnings);
  physicalTargets.forEach((t, i) => {
    const id = t.id || `target-${i + 1}`;
    if (seen.has(id)) return;
    seen.add(id);
    const activeKeys = activeKeysByTarget.get(id) || new Set<string>();
    const legacy_overrides = Object.fromEntries(Object.entries(t.legacy_overrides || {}).filter(([key]) => activeKeys.has(key)));
    const hasActiveOverrides = Object.keys(legacy_overrides).length > 0;
    if (!hasActiveOverrides) (t.legacy_warnings || []).forEach((warning) => cleanedWarnings.delete(warning));
    unique.push({
      ...blankPhysicalTarget(id, t.target_label),
      ...t,
      id,
      target_label: normalizeTargetLabel(t.target_label) || t.target_label || "",
      legacy_conflict: hasActiveOverrides ? Boolean(t.legacy_conflict) : false,
      legacy_warnings: hasActiveOverrides ? (t.legacy_warnings || []) : [],
      legacy_overrides: hasActiveOverrides ? legacy_overrides : undefined,
    });
  });
  return { post_number, instructions: instructions || "", source_text: source_text || "", physicalTargets: unique, sharedPresentations: normalizedShared, presentations: compilePresentations(unique, normalizedShared), compatibilityWarnings: Array.from(cleanedWarnings) };
}
export function descriptionFromPhysicalTarget(pt: PhysicalTarget): TargetDescription { return { target_label: pt.target_label, target_type: pt.target_type, direction: pt.direction, angle: pt.angle, speed: pt.speed, distance: pt.distance, difficulty: pt.difficulty, notes: pt.notes }; }
export function compilePresentations(physicalTargets: PhysicalTarget[], sharedPresentations: SharedPresentation[]): Presentation[] { const byId = new Map(physicalTargets.map((t)=>[t.id,t])); let position = 1; return sharedPresentations.map((p,i)=>{ const targets = Array.from({ length: targetCountFor(p.presentation_type) }, (_, idx) => { const pt = byId.get(p.target_ids[idx]); const overrideKey = p.legacy_override_keys?.[idx]; const override = overrideKey && pt?.legacy_overrides?.[overrideKey] ? pt.legacy_overrides[overrideKey] : null; const desc = pt ? (override ? { ...override, target_label: pt.target_label } : descriptionFromPhysicalTarget(pt)) : null; return { ...blankTarget(position + idx, idx + 1), ...(desc || {}), target_position: position + idx, position_in_presentation: idx + 1 }; }); position += targets.length; return { presentation_number: i+1, presentation_type: p.presentation_type, target_ids: p.target_ids, legacy_override_keys: p.legacy_override_keys, targets }; }); }
export function resolvePhysicalTargetOverrides(post: PostTargets, targetId: string): PostTargets { const target = post.physicalTargets.find((t) => t.id === targetId); const warningsToRemove = new Set([...(target?.legacy_warnings || []), ...(target ? [`Target ${normalizeTargetLabel(target.target_label)} `] : [])]); const physicalTargets = post.physicalTargets.map((item) => item.id === targetId ? { ...item, legacy_conflict: false, legacy_warnings: [], legacy_overrides: undefined } : item); const sharedPresentations = post.sharedPresentations.map((presentation) => ({ ...presentation, legacy_override_keys: presentation.legacy_override_keys?.map((key, idx) => presentation.target_ids[idx] === targetId ? "" : key) || [] })); const compatibilityWarnings = (post.compatibilityWarnings || []).filter((warning) => !Array.from(warningsToRemove).some((text) => text && warning.includes(text))); return normalizeSharedPost(post.post_number, physicalTargets, sharedPresentations, post.instructions, post.source_text, compatibilityWarnings); }
export function duplicateSharedPresentation(post: PostTargets, index: number): PostTargets { const source = post.sharedPresentations[index]; if (!source) return post; return normalizeSharedPost(post.post_number, post.physicalTargets, [...post.sharedPresentations, { presentation_number: post.sharedPresentations.length + 1, presentation_type: source.presentation_type, target_ids: [...source.target_ids], legacy_override_keys: [] }], post.instructions, post.source_text, post.compatibilityWarnings || []); }
export function copyPresentationToRemaining(post: PostTargets, index: number, expectedPresentationCount: number): PostTargets { const source = post.sharedPresentations[index]; if (!source) return post; const next = [...post.sharedPresentations]; for (let i = index + 1; i < expectedPresentationCount; i++) { const existing = next[i]; const copy = { presentation_number: i + 1, presentation_type: source.presentation_type, target_ids: [...source.target_ids], legacy_override_keys: [] }; if (!existing) next[i] = copy; else if (!existing.target_ids.some(Boolean)) next[i] = copy; } return normalizeSharedPost(post.post_number, post.physicalTargets, next, post.instructions, post.source_text, post.compatibilityWarnings || []); }
export function normalizePost(post_number: number, presentations: Presentation[], instructions = "", source_text = ""): PostTargets { return rehydrateSharedPost({ post_number, instructions, source_text, presentations: normalizeOccurrencePresentations(presentations) }); }
function normalizeOccurrencePresentations(presentations: Presentation[]) { let position = 1; return presentations.map((p, i) => { const targets = Array.from({ length: targetCountFor(p.presentation_type) }, (_, idx) => { const oldTarget = p.targets[idx] || {}; return { ...blankTarget(position + idx, idx + 1), ...oldTarget, target_position: position + idx, position_in_presentation: idx + 1 }; }); position += targets.length; return { presentation_number: i + 1, presentation_type: p.presentation_type, targets }; }); }
export function emptyPosts(count: number): PostTargets[] { return Array.from({ length: count }, (_, i) => normalizeSharedPost(i + 1)); }
export function ensurePostCount(posts: PostTargets[], count: number) { return Array.from({ length: count }, (_, i) => { const p = posts[i]; return p?.physicalTargets ? normalizeSharedPost(i + 1, p.physicalTargets, p.sharedPresentations || [], p.instructions, p.source_text, p.compatibilityWarnings || []) : normalizePost(i + 1, p?.presentations || [], p?.instructions || "", p?.source_text || ""); }); }
export function template(type: "report"|"simultaneous"|"singles"): Presentation[] { const ptype: PresentationType = type === "report" ? "report_pair" : type === "simultaneous" ? "simultaneous_pair" : "single"; return normalizeSharedPost(1, [], Array.from({ length: type === "singles" ? 10 : 5 }, (_, i) => ({ presentation_number: i+1, presentation_type: ptype, target_ids: [] }))).presentations; }
export function rowsFromPosts(sessionId: string, posts: PostTargets[]) { return posts.flatMap((post) => compilePresentations(post.physicalTargets || [], post.sharedPresentations || []).flatMap((p) => p.targets.map((t) => ({ session_id: sessionId, post_number: post.post_number, target_position: t.target_position, presentation_number: p.presentation_number, presentation_type: p.presentation_type, position_in_presentation: t.position_in_presentation, target_label: (t.target_label || "").trim() || null, target_type: t.target_type, direction: t.direction, angle: t.angle, speed: t.speed, distance: t.distance, difficulty: t.difficulty, notes: t.notes.trim() || null, updated_at: new Date().toISOString() })))); }
export function detailRowsFromPosts(sessionId: string, posts: PostTargets[]) { return posts.filter((post) => post.instructions.trim() || post.source_text.trim()).map((post) => ({ session_id: sessionId, post_number: post.post_number, instructions: post.instructions.trim() || null, source_text: post.source_text.trim() || null, updated_at: new Date().toISOString() })); }
export function migrateDraft(value: any, sessionId: string): Draft | null { if (!value || typeof value !== "object" || value.sessionId !== sessionId || !Array.isArray(value.posts)) return null; if (![1,2,3].includes(value.schemaVersion)) return null; const postCount = Math.max(1, Number(value.postCount || value.posts.length || 1)); const posts = ensurePostCount(value.posts.map((post: any, i: number) => post.physicalTargets ? normalizeSharedPost(Number(post.post_number || i + 1), post.physicalTargets || [], post.sharedPresentations || [], post.instructions || "", post.source_text || "", post.compatibilityWarnings || []) : normalizePost(Number(post.post_number || i + 1), Array.isArray(post.presentations) ? post.presentations : [], post.instructions || "", post.source_text || "")), postCount); const localUpdateAt = normalizeDraftTimestamp(value.lastLocalUpdateAt) || new Date().toISOString(); const targetsPerPost = Math.max(1, Math.round(Number(value.targetsPerPost || value.targets_per_post || 10))); const defaultPostFormat = typeof value.defaultPostFormat === "string" && value.defaultPostFormat.trim() ? value.defaultPostFormat : typeof value.default_post_format === "string" && value.default_post_format.trim() ? value.default_post_format : "5 pairs"; return { schemaVersion: DRAFT_SCHEMA_VERSION, sessionId, postCount, targetsPerPost, defaultPostFormat, posts, lastLocalUpdateAt: localUpdateAt, lastServerSyncAt: normalizeDraftTimestamp(value.lastServerSyncAt), hasUnsyncedChanges: Boolean(value.hasUnsyncedChanges) }; }
