export type GroundNameSource = "sessions" | "training_logs" | "training_score_sheets";

export type DistinctGroundName = {
  name: string;
  normalizedName: string;
  source: GroundNameSource;
  count: number;
  latestDate: string | null;
  assignedGroundId: string | null;
};

export type UserShootingGround = {
  id: string;
  display_name: string;
  normalized_display_name: string;
  country_code: string | null;
  municipality: string | null;
  aliases?: UserShootingGroundAlias[];
};

export type UserShootingGroundAlias = {
  id: string;
  user_shooting_ground_id: string;
  alias_name: string;
  normalized_alias: string;
  source: string | null;
};

const COMMON_WORDS = new Set([
  "shooting", "ground", "clay", "target", "range", "club", "association", "venue", "bane", "leirduebane", "leirduebanen",
]);

export function normalizeShootingGroundName(value: string) {
  return value
    .toLowerCase()
    .replace(/\bj\s*\.?\s*f\s*\.?\s*f\s*\.?\b/g, "jff")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && !COMMON_WORDS.has(token))
    .join(" ")
    .trim();
}

function tokenSet(value: string) {
  return new Set(normalizeShootingGroundName(value).split(" ").filter(Boolean));
}

function similarity(a: string, b: string) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return 0;
  const shared = [...left].filter((token) => right.has(token)).length;
  return shared / Math.max(left.size, right.size);
}

export function buildDuplicateSuggestions(names: DistinctGroundName[]) {
  const unassigned = names.filter((item) => !item.assignedGroundId && item.normalizedName);
  const groups: DistinctGroundName[][] = [];
  const used = new Set<string>();
  for (const name of unassigned) {
    const key = `${name.source}:${name.name}`;
    if (used.has(key)) continue;
    const matches = unassigned.filter((candidate) => {
      if (candidate.name === name.name && candidate.source === name.source) return false;
      return candidate.normalizedName === name.normalizedName || similarity(candidate.name, name.name) >= 0.5;
    });
    if (matches.length) {
      const group = [name, ...matches].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      group.forEach((item) => used.add(`${item.source}:${item.name}`));
      groups.push(group);
    }
  }
  return groups.sort((a, b) => b.reduce((sum, item) => sum + item.count, 0) - a.reduce((sum, item) => sum + item.count, 0));
}
