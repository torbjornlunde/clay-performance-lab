export function validateClayArenaUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["clayarena.com", "www.clayarena.com"].includes(url.hostname.toLowerCase()) || url.username || url.password || url.port) return null;
    const match = url.pathname.match(/^\/(?:[a-z]{2}\/)?competitions\/([^/]+)\/results\/?$/i);
    if (!match || !/^[a-z0-9-]+$/i.test(match[1])) return null;
    url.hash = "";
    return { url: url.toString(), competitionId: match[1] };
  } catch { return null; }
}

