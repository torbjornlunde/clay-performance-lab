export type WhatsNewEntry = {
  id: string;
  title: string;
  bullets: readonly string[];
  href?: string;
  linkLabel?: string;
};

export type ParsedWhatsNewId = {
  sequence: number;
  month: number;
  year: number;
  monthKey: string;
};

const ID_PATTERN = /^v([1-9]\d*)\.(0[1-9]|1[0-2])\.(\d{2})$/;

export function parseWhatsNewId(id: string): ParsedWhatsNewId {
  const match = ID_PATTERN.exec(id);
  if (!match) throw new Error(`Invalid What's new ID: ${id}`);
  const sequence = Number(match[1]);
  const month = Number(match[2]);
  const year = 2000 + Number(match[3]);
  return { sequence, month, year, monthKey: `${match[3]}-${match[2]}` };
}

export function compareWhatsNewIdsNewestFirst(left: string, right: string) {
  const a = parseWhatsNewId(left);
  const b = parseWhatsNewId(right);
  return b.year - a.year || b.month - a.month || b.sequence - a.sequence;
}

export function whatsNewMonthHeading(id: string) {
  const { month, year } = parseWhatsNewId(id);
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

export function validateWhatsNewEntries(entries: readonly WhatsNewEntry[]) {
  const ids = new Set<string>();
  const monthlySequences = new Map<string, number[]>();
  for (const entry of entries) {
    const parsed = parseWhatsNewId(entry.id);
    if (ids.has(entry.id)) throw new Error(`Duplicate What's new ID: ${entry.id}`);
    ids.add(entry.id);
    monthlySequences.set(parsed.monthKey, [...(monthlySequences.get(parsed.monthKey) ?? []), parsed.sequence]);
  }
  for (const [monthKey, sequences] of monthlySequences) {
    const ordered = [...sequences].sort((a, b) => a - b);
    ordered.forEach((sequence, index) => {
      if (sequence !== index + 1) throw new Error(`Invalid What's new sequence for ${monthKey}`);
    });
  }
  return true;
}

export function groupWhatsNewEntries(entries: readonly WhatsNewEntry[]) {
  validateWhatsNewEntries(entries);
  const sorted = [...entries].sort((a, b) => compareWhatsNewIdsNewestFirst(a.id, b.id));
  const groups: Array<{ key: string; heading: string; entries: WhatsNewEntry[] }> = [];
  for (const entry of sorted) {
    const { monthKey } = parseWhatsNewId(entry.id);
    let group = groups.at(-1);
    if (!group || group.key !== monthKey) {
      group = { key: monthKey, heading: whatsNewMonthHeading(entry.id), entries: [] };
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}

export function latestWhatsNewEntry(entries: readonly WhatsNewEntry[]) {
  validateWhatsNewEntries(entries);
  return [...entries].sort((a, b) => compareWhatsNewIdsNewestFirst(a.id, b.id))[0] ?? null;
}

export const WHATS_NEW_ENTRIES: readonly WhatsNewEntry[] = [
  { id: "v3.08.26", title: "What’s new in the app", bullets: ["Recent meaningful improvements are now collected in one place.", "Open What’s new from Menu → Support.", "A small New marker shows when an update has not been opened on this device."] },
  { id: "v2.08.26", title: "Safer result import review", bullets: ["Review and correct imported Leirdue.net results before saving.", "Edit total targets, winning score and individual series values.", "Duplicate checking is repeated using the reviewed values."] },
  { id: "v1.08.26", title: "More useful training logs", bullets: ["Upgrade a quick training log into a detailed Training session.", "Keep the original date, score, location, notes and equipment.", "Continue adding posts, targets and miss details later."] },
  { id: "v3.07.26", title: "Better mobile app experience", bullets: ["Install Clay Performance Lab directly from the app menu.", "Use safer in-app back navigation on mobile.", "Enjoy improved layouts and controls on narrow phone screens."] },
  { id: "v2.07.26", title: "Faster scorecard review", bullets: ["Review a complete scorecard in one compact overview.", "Correct individual Hit, Miss or Unknown values before saving.", "Keep the original scorecard photo close while reviewing."] },
  { id: "v1.07.26", title: "Live training score sheets", bullets: ["Record each shooter’s hits and misses target by target.", "Move quickly between shooters and posts while scoring.", "Keep local progress during temporary connection problems."] },
];

validateWhatsNewEntries(WHATS_NEW_ENTRIES);
