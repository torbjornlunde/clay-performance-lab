export type LabTrainingDraft = { userId: string; createdAt: number; focus: string; steps: string[]; discipline: string };
type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const key = (userId: string) => `cpl:lab-training:v1:${userId}`;
const lifetime = 60 * 60 * 1000;

export function safeDraftStorage(browser: { sessionStorage: Storage }): DraftStorage | null {
  try { return browser.sessionStorage; } catch { return null; }
}
export function readTrainingDraft(storage: DraftStorage | null, userId: string, now = Date.now()): LabTrainingDraft | null {
  try {
    const value = JSON.parse(storage?.getItem(key(userId)) || "null");
    if (!value || value.userId !== userId || !Number.isFinite(value.createdAt) || value.createdAt > now || now - value.createdAt > lifetime || typeof value.focus !== "string" || !value.focus.trim() || value.focus.length > 140 || typeof value.discipline !== "string" || value.discipline.length > 100 || !Array.isArray(value.steps) || !value.steps.length || value.steps.length > 6 || value.steps.some((item: unknown) => typeof item !== "string" || !item.trim() || item.length > 1600)) return null;
    return { userId, createdAt: value.createdAt, focus: value.focus, steps: value.steps, discipline: value.discipline };
  } catch { return null; }
}
export function saveTrainingDraft(storage: DraftStorage | null, draft: LabTrainingDraft): boolean {
  try {
    if (!storage || !readTrainingDraft({ getItem: () => JSON.stringify(draft), setItem() {}, removeItem() {} }, draft.userId, draft.createdAt)) return false;
    storage.setItem(key(draft.userId), JSON.stringify(draft));
    return true;
  } catch { return false; }
}
export function clearTrainingDraft(storage: DraftStorage | null, userId: string) {
  try { storage?.removeItem(key(userId)); } catch { /* A blocked store must not block logging. */ }
}
export function trainingDraftNote(draft: LabTrainingDraft) {
  return `Lab Insights suggestion to test (not an observed result):\n${draft.focus}\n${draft.steps.map((step) => `- ${step}`).join("\n")}`;
}
