"use client";

import { useEffect } from "react";
import { markLatestWhatsNewSeen, safeBrowserLocalStorage } from "@/lib/updates/whatsNewSeen";

export function WhatsNewSeenMarker({ latestId }: { latestId: string }) {
  useEffect(() => {
    markLatestWhatsNewSeen(safeBrowserLocalStorage(window), latestId, window);
  }, [latestId]);
  return null;
}
