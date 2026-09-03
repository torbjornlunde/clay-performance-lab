export const COMPETITION_CONTEXT_TAGS = [
  { id: "wind", label: "Wind" },
  { id: "rain", label: "Rain" },
  { id: "bad_light", label: "Bad light" },
  { id: "tired", label: "Tired" },
  { id: "good_focus", label: "Good focus" },
  { id: "lost_focus", label: "Lost focus" },
  { id: "bad_start", label: "Bad start" },
  { id: "difficult_finish", label: "Difficult finish" },
  { id: "rabbit", label: "Rabbit" },
  { id: "crossers", label: "Crossers" },
  { id: "fast_targets", label: "Fast targets" },
  { id: "slow_targets", label: "Slow targets" },
  { id: "incomers", label: "Incomers" },
  { id: "outgoers", label: "Outgoers" },
  { id: "equipment_change", label: "Equipment change" },
] as const;

export type CompetitionContextTagId = (typeof COMPETITION_CONTEXT_TAGS)[number]["id"];

const tagIds = new Set<string>(COMPETITION_CONTEXT_TAGS.map((tag) => tag.id));

export function normalizeCompetitionContextTags(value: unknown): CompetitionContextTagId[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is CompetitionContextTagId => typeof item === "string" && tagIds.has(item)))];
}

export function competitionContextTagLabel(id: string) {
  return COMPETITION_CONTEXT_TAGS.find((tag) => tag.id === id)?.label || id;
}
