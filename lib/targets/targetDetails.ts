export type TargetDetails = {
  label?: string | null;
  targetType?: string | null;
  direction?: string | null;
  angle?: string | number | null;
  speed?: string | null;
  distance?: string | number | null;
  difficulty?: string | number | null;
  notes?: string | null;
};

export const TARGET_TYPES = ["Unknown", "Standard", "Midi", "Mini", "Battue", "Rabbit", "Rocket", "Chandelle", "Loop", "Teal", "Other", "Crossing", "Incoming", "Going away", "Rising", "Dropping", "Looper", "Overhead"] as const;
export const TARGET_DIRECTIONS = ["Unknown", "Left to right", "Right to left", "Incoming", "Going away", "Rising", "Dropping", "Straight up", "Overhead", "Rabbit", "Quartering left", "Quartering right", "Other"] as const;
export const TARGET_SPEEDS = ["Unknown", "Very slow", "Slow", "Medium", "Fast", "Very fast"] as const;
export const TARGET_DISTANCES = ["Unknown", "Close", "Medium", "Long"] as const;
export const TARGET_ANGLES = ["Unknown", "Straight", "Slight left", "Slight right", "Hard left", "Hard right", "High", "Low", "Quartering", "Other"] as const;
export const TARGET_DIFFICULTIES = ["Unknown", "1 - Easy", "2 - Manageable", "3 - Medium", "4 - Hard", "5 - Very hard", "Easy", "Medium", "Hard", "Tricky"] as const;

function optional(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text && text !== "Unknown" ? text : null;
}

export function normalizeTargetDetails(input: TargetDetails = {}): Required<TargetDetails> {
  return {
    label: optional(input.label),
    targetType: optional(input.targetType),
    direction: optional(input.direction),
    angle: optional(input.angle),
    speed: optional(input.speed),
    distance: optional(input.distance),
    difficulty: optional(input.difficulty),
    notes: optional(input.notes),
  };
}

export function targetDetailsHaveValue(input: TargetDetails = {}) {
  const normalized = normalizeTargetDetails(input);
  return Object.values(normalized).some((value) => value !== null);
}

export function optionsWithCurrent(options: readonly string[], current: unknown) {
  const values = [...options];
  const text = typeof current === "string" ? current.trim() : "";
  if (text && !values.includes(text)) values.push(text);
  return values;
}

export function targetDetailsSummary(input: TargetDetails = {}) {
  const normalized = normalizeTargetDetails(input);
  const parts = [normalized.speed, normalized.distance, normalized.difficulty ? `Difficulty ${String(normalized.difficulty).replace(/^([1-5])\s*-\s*/, "$1 ")}` : null, normalized.angle]
    .filter((value): value is string => Boolean(value));
  return parts.length ? parts.slice(0, 3).join(" · ") : "Optional";
}

export type ShareableCompetitionTemplate = {
  discipline: string;
  posts: Array<{
    postNumber: number;
    presentations: Array<{
      presentationNumber: number;
      presentationType: string;
      targets: Array<{ targetPosition: number; positionInPresentation: number; details: Required<TargetDetails> }>;
    }>;
  }>;
  physicalTargets?: Array<{ key: string; details: Required<TargetDetails> }>;
  program?: unknown;
};

export function normalizePostTargetsForTemplate(discipline: string, posts: Array<any>): ShareableCompetitionTemplate {
  return {
    discipline,
    posts: posts.map((post) => ({
      postNumber: Number(post.post_number ?? post.postNumber),
      presentations: (post.presentations || []).map((presentation: any) => ({
        presentationNumber: Number(presentation.presentation_number ?? presentation.presentationNumber),
        presentationType: String(presentation.presentation_type ?? presentation.presentationType ?? "unknown"),
        targets: (presentation.targets || []).map((target: any) => ({
          targetPosition: Number(target.target_position ?? target.targetPosition),
          positionInPresentation: Number(target.position_in_presentation ?? target.positionInPresentation),
          details: normalizeTargetDetails({
            label: target.target_label ?? target.label,
            targetType: target.target_type ?? target.targetType,
            direction: target.direction,
            angle: target.angle,
            speed: target.speed,
            distance: target.distance,
            difficulty: target.difficulty,
            notes: target.notes,
          }),
        })),
      })),
    })),
  };
}

export function normalizePhysicalTargetsForTemplate(discipline: string, physicalTargets: Array<any>, program: unknown): ShareableCompetitionTemplate {
  return {
    discipline,
    posts: [],
    physicalTargets: physicalTargets.map((target) => ({
      key: String(target.machine ?? target.key ?? target.label),
      details: normalizeTargetDetails({
        label: target.target_label ?? target.label ?? target.machine,
        targetType: target.target_type ?? target.targetType,
        direction: target.direction,
        angle: target.angle,
        speed: target.speed,
        distance: target.distance,
        difficulty: target.difficulty,
        notes: target.notes,
      }),
    })),
    program,
  };
}
