"use client";

import { useEffect } from "react";
import { markLatestWhatsNewSeen } from "@/lib/updates/whatsNewSeen";

export function WhatsNewSeenMarker({ latestId }: { latestId: string }) {
  useEffect(() => {
    markLatestWhatsNewSeen(window.localStorage, latestId, window);
  }, [latestId]);
  return null;
}
