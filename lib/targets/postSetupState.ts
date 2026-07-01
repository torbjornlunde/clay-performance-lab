import { postHasMeaningfulData, type PostTargets } from "./postTargets";
import type { PendingPostSignPhoto } from "./postSignPhotos";

export const DEFAULT_POST_FORMATS = ["5 pairs", "5 report pairs", "5 simultaneous pairs", "10 singles"] as const;

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
