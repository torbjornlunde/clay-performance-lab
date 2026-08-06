import { compareWhatsNewIdsNewestFirst, parseWhatsNewId } from "./whatsNew";

export const WHATS_NEW_SEEN_STORAGE_KEY = "clay-performance-lab:whats-new:seen";
export const WHATS_NEW_SEEN_EVENT = "clay-performance-lab:whats-new-seen";

type StorageLike = Pick<Storage, "getItem" | "setItem">;
type EventTargetLike = Pick<EventTarget, "dispatchEvent">;

export function safeBrowserLocalStorage(
  browserWindow: Pick<Window, "localStorage"> | null | undefined,
): Storage | null {
  try {
    return browserWindow?.localStorage ?? null;
  } catch {
    return null;
  }
}

export function isLatestWhatsNewUnseen(storedValue: string | null | undefined, latestId: string) {
  parseWhatsNewId(latestId);
  if (!storedValue) return true;
  try {
    return compareWhatsNewIdsNewestFirst(storedValue, latestId) > 0;
  } catch {
    return true;
  }
}

export function readWhatsNewUnseen(storage: StorageLike | null | undefined, latestId: string) {
  if (!storage) return false;
  try {
    return isLatestWhatsNewUnseen(storage.getItem(WHATS_NEW_SEEN_STORAGE_KEY), latestId);
  } catch {
    return false;
  }
}

export function markLatestWhatsNewSeen(storage: StorageLike | null | undefined, latestId: string, eventTarget?: EventTargetLike | null) {
  if (!storage) return false;
  try {
    parseWhatsNewId(latestId);
    storage.setItem(WHATS_NEW_SEEN_STORAGE_KEY, latestId);
    eventTarget?.dispatchEvent(new Event(WHATS_NEW_SEEN_EVENT));
    return true;
  } catch {
    return false;
  }
}
