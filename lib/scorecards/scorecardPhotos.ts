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
  schemaVersion: 3;
  queueId: string;
  clientImportId: string;
  sessionId: string;
  image: Blob;
  mimeType: string;
  imageFingerprint: string;
  createdAt: string;
  updatedAt: string;
  status: ScorecardPhotoStatus;
  analysis?: NormalizedScorecardAnalysis;
  selectedShooterCandidateId?: string | null;
  reviewedGrid?: ScorecardCell[];
  scoreChoice?: "use_scorecard" | "keep_existing";
  acknowledgeAmbiguousExisting?: boolean;
  lastError?: string | null;
};
const DB = "scorecard-photo-imports-v1",
  STORE = "pending_scorecards",
  VERSION = 3;
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
    schemaVersion: 3,
    queueId: raw.queueId || raw.clientImportId,
    clientImportId: raw.clientImportId,
    sessionId: raw.sessionId,
    image: raw.image,
    mimeType: raw.mimeType || raw.image.type || "image/jpeg",
    imageFingerprint: raw.imageFingerprint,
    createdAt: raw.createdAt || now(),
    updatedAt: raw.updatedAt || now(),
    status:
      status === "analyzing" || status === "applying"
        ? "analysis_failed"
        : status,
    analysis: raw.analysis,
    selectedShooterCandidateId: selected,
    reviewedGrid: Array.isArray(raw.reviewedGrid)
      ? raw.reviewedGrid
      : fallbackGrid,
    scoreChoice:
      raw.scoreChoice === "keep_existing" ? "keep_existing" : "use_scorecard",
    acknowledgeAmbiguousExisting: Boolean(raw.acknowledgeAmbiguousExisting),
    lastError: typeof raw.lastError === "string" ? raw.lastError : null,
  };
}
export async function savePendingScorecardPhoto(record: PendingScorecardPhoto) {
  const db = await openDb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({
      ...record,
      schemaVersion: 3,
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
    | { sessionId: string; clientImportId: string; imageFingerprint: string }
    | null
    | undefined,
  next: { sessionId: string; clientImportId: string; imageFingerprint: string },
) {
  return (
    !active ||
    active.sessionId !== next.sessionId ||
    active.clientImportId !== next.clientImportId ||
    active.imageFingerprint !== next.imageFingerprint
  );
}
export function validateReplacement(confirmed: boolean, hasPending: boolean) {
  return !hasPending || confirmed;
}
