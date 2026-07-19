export type PushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export type PushState = "unsupported" | "blocked" | "enabled" | "disabled";

const BASE_URL = "https://clay-performance-lab.local";

export function safePushHref(href: string | null | undefined) {
  if (!href || !href.startsWith("/") || href.startsWith("//")) return "/notifications";
  try {
    const url = new URL(href, BASE_URL);
    if (url.origin !== BASE_URL) return "/notifications";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/notifications";
  }
}

export function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function pushSupported() {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}
