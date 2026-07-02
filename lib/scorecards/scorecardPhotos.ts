import type {
  NormalizedScorecardAnalysis,
  ScorecardCell,
} from "./scorecardAnalysis";
export type ScorecardPhotoStatus =
  | "saved_on_device"
  | "waiting_for_connection"
  | "analyzing"
  | "ready_for_review"
  | "analysis_failed"
  | "applying";
export type PendingScorecardPhoto = {
  schemaVersion: 4;
  queueId: string;
  clientImportId: string;
  sessionId: string;
  image: Blob;
  originalImage?: Blob;
  analyzedImage?: Blob;
  mimeType: string;
  imageFingerprint: string;
  originalImageFingerprint?: string;
  crop?: import("./scorecardCrop").NormalizedCrop;
  cropFingerprint?: string;
  preparationState?: "prepare" | "ready" | "review";
  lastSafeErrorCategory?: string | null;
  createdAt: string;
  updatedAt: string;
  status: ScorecardPhotoStatus;
  analysis?: NormalizedScorecardAnalysis;
  setupFingerprint?: string | null;
  resolvedSetup?: { postCount: number; targetsPerPostByPost: number[]; totalTargets: number } | null;
  selectedShooterCandidateId?: string | null;
  reviewedGrid?: ScorecardCell[];
  reviewedGridFingerprint?: string | null;
  scoreChoice?: "use_scorecard" | "keep_existing";
  acknowledgeAmbiguousExisting?: boolean;
  lastError?: string | null;
};
const DB = "scorecard-photo-imports-v1",
  STORE = "pending_scorecards",
  VERSION = 4;
function now() {
  return new Date().toISOString();
}
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE))
        db.createObjectStore(STORE, { keyPath: "sessionId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export function migratePendingScorecardPhoto(
  raw: any,
): PendingScorecardPhoto | null {
  if (
    !raw ||
    typeof raw !== "object" ||
    typeof raw.sessionId !== "string" ||
    typeof raw.clientImportId !== "string" ||
    typeof raw.imageFingerprint !== "string" ||
    !(raw.image instanceof Blob)
  )
    return null;
  const status: ScorecardPhotoStatus = [
    "saved_on_device",
    "waiting_for_connection",
    "analyzing",
    "ready_for_review",
    "analysis_failed",
    "applying",
  ].includes(raw.status)
    ? raw.status
    : "saved_on_device";
  const selected =
    typeof raw.selectedShooterCandidateId === "string"
      ? raw.selectedShooterCandidateId
      : null;
  const fallbackGrid =
    selected && raw.analysis?.shooterRows?.find
      ? raw.analysis.shooterRows.find((r: any) => r.candidateId === selected)
          ?.grid
      : undefined;
  return {
    schemaVersion: 4,
    queueId: raw.queueId || raw.clientImportId,
    clientImportId: raw.clientImportId,
    sessionId: raw.sessionId,
    image: raw.analyzedImage instanceof Blob ? raw.analyzedImage : raw.image,
    originalImage: raw.originalImage instanceof Blob ? raw.originalImage : raw.image,
    analyzedImage: raw.analyzedImage instanceof Blob ? raw.analyzedImage : raw.image,
    mimeType: raw.mimeType || raw.image.type || "image/jpeg",
    imageFingerprint: raw.cropFingerprint || raw.imageFingerprint,
    originalImageFingerprint: raw.originalImageFingerprint || raw.imageFingerprint,
    crop: raw.crop || { x: 0, y: 0, width: 1, height: 1, mode: "full" },
    cropFingerprint: raw.cropFingerprint || raw.imageFingerprint,
    preparationState: raw.preparationState || (raw.analysis ? "review" : "prepare"),
    createdAt: raw.createdAt || now(),
    updatedAt: raw.updatedAt || now(),
    status:
      status === "analyzing" || status === "applying"
        ? "saved_on_device"
        : status,
    analysis: raw.analysis,
    setupFingerprint: typeof raw.setupFingerprint === "string" ? raw.setupFingerprint : null,
    resolvedSetup: raw.resolvedSetup && typeof raw.resolvedSetup === "object" ? raw.resolvedSetup : null,
    selectedShooterCandidateId: selected,
    reviewedGrid: Array.isArray(raw.reviewedGrid)
      ? raw.reviewedGrid
      : fallbackGrid,
    reviewedGridFingerprint: typeof raw.reviewedGridFingerprint === "string" ? raw.reviewedGridFingerprint : (Array.isArray(raw.reviewedGrid) || fallbackGrid ? raw.cropFingerprint || raw.imageFingerprint : null),
    scoreChoice:
      raw.scoreChoice === "keep_existing" ? "keep_existing" : "use_scorecard",
    acknowledgeAmbiguousExisting: Boolean(raw.acknowledgeAmbiguousExisting),
    lastError: typeof raw.lastError === "string" ? raw.lastError : null,
    lastSafeErrorCategory: typeof raw.lastSafeErrorCategory === "string" ? raw.lastSafeErrorCategory : null,
  };
}
export async function savePendingScorecardPhoto(record: PendingScorecardPhoto) {
  const db = await openDb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({
      ...record,
      schemaVersion: 4,
      updatedAt: now(),
    });
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}
export async function getPendingScorecardPhoto(sessionId: string) {
  const db = await openDb();
  const out = await new Promise<PendingScorecardPhoto | null>((res, rej) => {
    const r = db.transaction(STORE).objectStore(STORE).get(sessionId);
    r.onsuccess = () => res(migratePendingScorecardPhoto(r.result));
    r.onerror = () => rej(r.error);
  });
  db.close();
  if (out) await savePendingScorecardPhoto(out);
  return out;
}
export async function deletePendingScorecardPhoto(sessionId: string) {
  const db = await openDb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(sessionId);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}
export function shouldIgnoreStale(
  active:
    | { sessionId: string; clientImportId: string; imageFingerprint: string; cropFingerprint?: string }
    | null
    | undefined,
  next: { sessionId: string; clientImportId: string; imageFingerprint: string; cropFingerprint?: string },
) {
  return (
    !active ||
    active.sessionId !== next.sessionId ||
    active.clientImportId !== next.clientImportId ||
    active.imageFingerprint !== next.imageFingerprint || (active.cropFingerprint || active.imageFingerprint) !== (next.cropFingerprint || next.imageFingerprint)
  );
}
export function validateReplacement(confirmed: boolean, hasPending: boolean) {
  return !hasPending || confirmed;
}
