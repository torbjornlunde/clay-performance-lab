import { validateClayArenaUrl } from "./clayarena/url";

export type PublishedResultProvider = "clayarena" | "leirdue";

export function publishedResultProvider(value: string): PublishedResultProvider | null {
  try {
    const url = new URL(value.trim());
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port) return null;
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (validateClayArenaUrl(value.trim())) return "clayarena";
    if (hostname === "leirdue.net" && (url.searchParams.get("stevne") || url.searchParams.get("liste_id"))) return "leirdue";
  } catch {
    return null;
  }
  return null;
}

export function publishedResultImportHref(provider: PublishedResultProvider, sourceUrl?: string) {
  const route = `/import/${provider}`;
  return sourceUrl ? `${route}?url=${encodeURIComponent(sourceUrl.trim())}` : route;
}
