export type PublishedResultProvider = "clayarena" | "leirdue";

export function publishedResultProvider(value: string): PublishedResultProvider | null {
  try {
    const hostname = new URL(value.trim()).hostname.toLowerCase().replace(/^www\./, "");
    if (hostname === "clayarena.com" || hostname.endsWith(".clayarena.com")) return "clayarena";
    if (hostname === "leirdue.net" || hostname.endsWith(".leirdue.net")) return "leirdue";
  } catch {
    return null;
  }
  return null;
}

export function publishedResultImportHref(provider: PublishedResultProvider, sourceUrl?: string) {
  const route = `/import/${provider}`;
  return sourceUrl ? `${route}?url=${encodeURIComponent(sourceUrl.trim())}` : route;
}
