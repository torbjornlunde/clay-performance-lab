import { postHasMeaningfulData, type PostTargets } from "./postTargets";
import type { PendingPostSignPhoto } from "./postSignPhotos";

export const DEFAULT_POST_FORMATS = ["5 pairs", "2 singles + 2 report pairs + 1 simo pair", "Custom / unknown", "5 report pairs", "5 simultaneous pairs", "10 singles"] as const;

export function normalizeSyncTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const time = Date.parse(trimmed);
  if (!Number.isFinite(time)) return undefined;
  if (time <= Date.UTC(1971, 0, 1)) return undefined;
  return new Date(time).toISOString();
}

export function setupTotal(postCount: number, targetsPerPost: number) {
  return Math.max(1, Math.round(postCount || 1)) * Math.max(1, Math.round(targetsPerPost || 1));
}

export function normalizeDefaultPostFormat(value: string | null | undefined) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || "5 pairs";
}

export function postFormatOptions(current?: string | null) {
  const normalized = normalizeDefaultPostFormat(current);
  return DEFAULT_POST_FORMATS.includes(normalized as any) ? [...DEFAULT_POST_FORMATS] : [normalized, ...DEFAULT_POST_FORMATS];
}

export function shouldApplyPendingPhotoLoad(capturedSessionId: string, activeSessionId: string, stillActive: boolean) {
  return stillActive && capturedSessionId === activeSessionId;
}

export function setupMetadata(postCount: number, targetsPerPost: number, defaultPostFormat: string) {
  return {
    post_count: postCount,
    course_count: postCount,
    targets_per_post: targetsPerPost,
    default_post_format: defaultPostFormat,
  };
}

export function shouldConfirmTotalTargetChange(existingTotal: unknown, nextTotal: number) {
  return typeof existingTotal === "number" && Number.isFinite(existingTotal) && existingTotal > 0 && existingTotal !== nextTotal;
}

export type PostButtonStatus = "Sync failed" | "Ready to review" | "Photo saved" | "Set up" | "Partly set up" | "Not started";

export function statusForPost(args: { post: PostTargets; expectedTargets: number; pendingPhoto?: PendingPostSignPhoto | null; syncFailed?: boolean }) : PostButtonStatus {
  if (args.syncFailed) return "Sync failed";
  if (args.pendingPhoto?.analysis && args.pendingPhoto.status === "ready_for_review") return "Ready to review";
  if (args.pendingPhoto) return "Photo saved";
  const targetCount = args.post.presentations.reduce((sum, p) => sum + p.targets.length, 0);
  if (targetCount > 0 && targetCount >= args.expectedTargets) return "Set up";
  if (postHasMeaningfulData(args.post) || targetCount > 0) return "Partly set up";
  return "Not started";
}

export function scopedPhotoKey(sessionId: string, postNumber: number) {
  return `${sessionId}:${postNumber}`;
}


export function configuredPostCount(posts: PostTargets[], expectedTargets: number) {
  return posts.filter((post) => post.presentations.reduce((sum, presentation) => sum + presentation.targets.length, 0) >= expectedTargets).length;
}

export function postNumbersMeetingExpected(rows: Array<{ post_number: number | null }>, expectedTargets: number) {
  const counts = new Map<number, number>();
  rows.forEach((row) => {
    const postNumber = Number(row.post_number);
    if (Number.isFinite(postNumber) && postNumber > 0) counts.set(postNumber, (counts.get(postNumber) || 0) + 1);
  });
  return Array.from(counts.values()).filter((count) => count >= expectedTargets).length;
}

export function scoreDisplay(score: number | null | undefined, totalTargets: number | null | undefined) {
  if (typeof score !== "number" || !Number.isFinite(score)) return "No result yet";
  return typeof totalTargets === "number" && Number.isFinite(totalTargets) && totalTargets > 0 ? `${score} / ${totalTargets}` : String(score);
}

export type PlannedSetupSave = { shouldContinue: boolean; metadata: Record<string, number | string | null>; conflict: boolean };
export function planSetupSave(args: { postCount: number; targetsPerPost: number; defaultPostFormat: string; existingTotal: unknown; confirmConflict: () => boolean }): PlannedSetupSave {
  const metadata: Record<string, number | string | null> = setupMetadata(args.postCount, args.targetsPerPost, args.defaultPostFormat);
  const nextTotal = setupTotal(args.postCount, args.targetsPerPost);
  const conflict = shouldConfirmTotalTargetChange(args.existingTotal, nextTotal);
  if (conflict && !args.confirmConflict()) return { shouldContinue: false, metadata, conflict };
  if (args.existingTotal === null || args.existingTotal === undefined) metadata.total_targets = nextTotal;
  return { shouldContinue: true, metadata, conflict };
}
