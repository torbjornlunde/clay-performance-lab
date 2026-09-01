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
  { id: "v1.09.26", title: "Keep scoring through connection loss", bullets: ["Continue using an opened Training or Competition Score Sheet when your connection drops.", "See when changes are saved on your device and sync them safely when you reconnect.", "Review both versions before deciding what to keep if the server changed elsewhere."] },
  { id: "v14.08.26", title: "Add scored competition results to your profile", bullets: ["Review a finalized Competition Score Sheet result when an organizer linked your CPL profile.", "Add it to your own Results with known missed target positions ready for personal review.", "Claiming is explicit and duplicate-safe while the organizer's scored result remains separate."] },
  { id: "v13.08.26", title: "Use the programme that was actually shot", bullets: ["Start from built-in Compak or Sporttrap programme structures.", "Correct a competition programme when an older or locally modified setup was used.", "Build a custom programme when the event does not match a standard template."] },
  { id: "v12.08.26", title: "Cleaner setup across shooting disciplines", bullets: ["Use one consistent discipline model across Training and Competition Score Sheets.", "See discipline-appropriate Post, Stand or Plate wording throughout setup and results.", "Keep current Compak and Leirduesti behavior while preparing other shooting formats for dedicated support later."] },
  { id: "v11.08.26", title: "Find CPL shooters faster", bullets: ["Search opted-in CPL profiles by name when adding shooters to a score sheet.", "Keep guest shooters fully supported when no account should be linked.", "Linked profiles keep the event name as a snapshot, so old results do not change after profile edits."] },
  { id: "v10.08.26", title: "Export finalized competition results", bullets: ["Open a clean finalized result view with every shooter, course or post score and overall total.", "Print the result or save it as a PDF through your browser.", "Download a UTF-8 CSV while ties, corrections and incomplete coverage stay clearly marked."] },
  { id: "v9.08.26", title: "Finalize competition results", bullets: ["Review scoring coverage before locking a Competition Score Sheet.", "Finalize the result as read-only, with incomplete targets clearly flagged when you explicitly accept them.", "Reopen deliberately for corrections, then finalize again when the result is ready."] },
  { id: "v8.08.26", title: "Score competitions live", bullets: ["Create a Competition Score Sheet and score shooters target by target from your phone or tablet.", "Use fast Field Mode, Compak sequencing and automatic running totals.", "Keep scoring through temporary connection loss with Competition-specific local recovery."] },
  { id: "v7.08.26", title: "Review one course from a saved scorecard photo", bullets: ["Analyze a saved scorecard photo for one Compak course without requiring the full Competition card.", "Keep other courses unknown while saving the course score and reviewed target detail you actually know.", "Your overall Competition result stays unchanged while you add course detail later."] },
  { id: "v6.08.26", title: "Keep scorecard photos with your result", bullets: ["Attach multiple scorecard photos directly to a Competition.", "Link each photo to a course or keep it with the whole session.", "Open, reassign, replace or remove your private scorecard evidence later."] },
  { id: "v5.08.26", title: "Save partial Compak programmes", bullets: ["Save a known Compak presentation pattern without choosing a guessed FITASC scheme.", "Keep each course clearly marked as Exact, Partial or Unknown.", "Add an exact scheme later without losing the programme information you remembered."] },
  { id: "v4.08.26", title: "Official CPL app icon", bullets: ["Clay Performance Lab now uses the gold CP and clay mark as its app icon.", "Fresh home-screen installations and browser tabs use the new branding.", "Existing iPhone installations may need to be removed and added again to refresh the icon."] },
  { id: "v3.08.26", title: "What’s new in the app", bullets: ["Recent meaningful improvements are now collected in one place.", "Open What’s new from Menu → Support.", "A small New marker shows when an update has not been opened on this device."] },
  { id: "v2.08.26", title: "Safer result import review", bullets: ["Review and correct imported Leirdue.net results before saving.", "Edit total targets, winning score and individual series values.", "Duplicate checking is repeated using the reviewed values."] },
  { id: "v1.08.26", title: "More useful training logs", bullets: ["Upgrade a quick training log into a detailed Training session.", "Keep the original date, score, location, notes and equipment.", "Continue adding posts, targets and miss details later."] },
  { id: "v3.07.26", title: "Better mobile app experience", bullets: ["Install Clay Performance Lab directly from the app menu.", "Use safer in-app back navigation on mobile.", "Enjoy improved layouts and controls on narrow phone screens."] },
  { id: "v2.07.26", title: "Faster scorecard review", bullets: ["Review a complete scorecard in one compact overview.", "Correct individual Hit, Miss or Unknown values before saving.", "Keep the original scorecard photo close while reviewing."] },
  { id: "v1.07.26", title: "Live training score sheets", bullets: ["Record each shooter’s hits and misses target by target.", "Move quickly between shooters and posts while scoring.", "Keep local progress during temporary connection problems."] },
];

validateWhatsNewEntries(WHATS_NEW_ENTRIES);
