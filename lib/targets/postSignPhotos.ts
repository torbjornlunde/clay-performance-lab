import type { PostSignAnalysisResult } from "./postSignAnalysis";
export type PendingPostSignPhotoStatus = "saved_on_device" | "waiting_for_connection" | "analyzing" | "ready_for_review" | "analysis_failed";
export type PendingPostSignPhoto = { schemaVersion: 1; queueId: string; sessionId: string; postNumber: number; image: Blob; imageId?: string; mimeType: string; createdAt: string; updatedAt: string; status: PendingPostSignPhotoStatus; lastError?: string; analysis?: PostSignAnalysisResult };
const DB_NAME = "cpl-post-sign-photos"; const STORE = "pending"; const VERSION = 1;
const key = (sessionId: string, postNumber: number) => `${sessionId}:${postNumber}`;
function openDb(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const req = indexedDB.open(DB_NAME, VERSION); req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "queueId" }); }; req.onerror = () => reject(req.error); req.onsuccess = () => resolve(req.result); }); }
async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> { const db = await openDb(); return new Promise((resolve, reject) => { const t = db.transaction(STORE, mode); const store = t.objectStore(STORE); const req = run(store); let val: T | undefined; if (req) { req.onsuccess = () => { val = req.result; }; req.onerror = () => reject(req.error); } t.oncomplete = () => { db.close(); resolve(val); }; t.onerror = () => { db.close(); reject(t.error); }; }); }
export async function getPendingPostSignPhoto(sessionId: string, postNumber: number) { return (await tx<PendingPostSignPhoto>("readonly", (s) => s.get(key(sessionId, postNumber)))) || null; }
export async function savePendingPostSignPhoto(item: Omit<PendingPostSignPhoto, "schemaVersion" | "queueId" | "createdAt" | "updatedAt" | "imageId">) { const existing = await getPendingPostSignPhoto(item.sessionId, item.postNumber); const now = new Date().toISOString(); const next: PendingPostSignPhoto = { ...item, schemaVersion: 1, queueId: key(item.sessionId, item.postNumber), imageId: crypto.randomUUID(), createdAt: existing?.createdAt || now, updatedAt: now }; await tx("readwrite", (s) => s.put(next)); return next; }
export function matchesPostSignPhoto(item: PendingPostSignPhoto | null, imageId?: string) { return Boolean(item && item.imageId === imageId); }
export async function updatePendingPostSignPhotoIfCurrent(sessionId: string, postNumber: number, imageId: string | undefined, patch: Partial<PendingPostSignPhoto>) {
  const db = await openDb();
  return new Promise<PendingPostSignPhoto | null>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    const request = store.get(key(sessionId, postNumber));
    let next: PendingPostSignPhoto | null = null;
    request.onsuccess = () => {
      const existing = request.result as PendingPostSignPhoto | undefined;
      if (!existing || !matchesPostSignPhoto(existing, imageId)) return;
      next = { ...existing, ...patch, queueId: existing.queueId, sessionId, postNumber, imageId, image: existing.image, updatedAt: new Date().toISOString() };
      store.put(next);
    };
    transaction.oncomplete = () => { db.close(); resolve(next); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
}
export async function deletePendingPostSignPhoto(sessionId: string, postNumber: number) { await tx("readwrite", (s) => s.delete(key(sessionId, postNumber))); }

export async function listPendingPostSignPhotos(sessionId: string) { const all = (await tx<PendingPostSignPhoto[]>("readonly", (s) => s.getAll())) || []; return all.filter((item) => item.sessionId === sessionId); }
