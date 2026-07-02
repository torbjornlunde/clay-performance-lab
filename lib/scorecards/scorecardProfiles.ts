import {
  COMPAK_SPORTING,
  LEIRDUESTI,
  SPORTTRAP,
  isPostBasedSportingDiscipline,
} from "../disciplines";
import {
  normalizeScorecardSetupForFingerprint,
  resolveScorecardSetup,
  scorecardSetupFingerprint,
  type ScorecardSetupResolution,
} from "./scorecardSetup";

export type ScorecardDisciplineProfile = {
  key: "post_based" | "compak" | "sporttrap";
  unitLabel: "Post" | "Stand" | "Series";
  reviewLabel: "Post" | "Stand" | "Series";
  defaultTargetsPerSeries?: number;
};

type TargetDefinition = {
  post_number: number | null;
  target_position: number | null;
};

export function scorecardDisciplineProfile(
  discipline?: string | null,
): ScorecardDisciplineProfile | null {
  const normalized = discipline?.trim().toLowerCase();
  if (normalized === COMPAK_SPORTING.toLowerCase())
    return {
      key: "compak",
      unitLabel: "Series",
      reviewLabel: "Series",
      defaultTargetsPerSeries: 25,
    };
  if (normalized === SPORTTRAP.toLowerCase())
    return {
      key: "sporttrap",
      unitLabel: "Series",
      reviewLabel: "Series",
      defaultTargetsPerSeries: 25,
    };
  if (isPostBasedSportingDiscipline(discipline))
    return {
      key: "post_based",
      unitLabel: normalized === LEIRDUESTI.toLowerCase() ? "Post" : "Stand",
      reviewLabel: normalized === LEIRDUESTI.toLowerCase() ? "Post" : "Stand",
    };
  return null;
}

export function isScorecardImportDiscipline(discipline?: string | null) {
  return Boolean(scorecardDisciplineProfile(discipline));
}

export function formatScorecardSetupSummary(
  setup: {
    postCount: number;
    targetsPerPost: number;
    targetsPerPostByPost?: number[];
    totalTargets?: number;
  },
  unitLabel = "Post",
) {
  const counts =
    Array.isArray(setup.targetsPerPostByPost) &&
    setup.targetsPerPostByPost.length === setup.postCount
      ? setup.targetsPerPostByPost
      : Array.from({ length: setup.postCount }, () => setup.targetsPerPost);
  const total =
    setup.totalTargets ?? counts.reduce((sum, count) => sum + count, 0);
  const uniform = counts.every((count) => count === counts[0]);
  if (uniform)
    return {
      compact: `${setup.postCount} ${unitLabel.toLowerCase()}s × ${counts[0]} targets`,
      lines: [] as string[],
      total,
    };
  return {
    compact: null,
    lines: counts.map((count, index) => `${unitLabel} ${index + 1}: ${count}`),
    total,
  };
}

export function resolveDisciplineScorecardSetup(options: {
  discipline?: string | null;
  postCount?: number | null;
  courseCount?: number | null;
  sporttrapSeriesCount?: number | null;
  targetsPerPost?: number | null;
  totalTargets?: number | null;
  targetDefinitions?: TargetDefinition[] | null;
}): ScorecardSetupResolution {
  const profile = scorecardDisciplineProfile(options.discipline);
  if (!profile)
    return {
      ok: false,
      message: "Scorecard import is not available for this discipline.",
    };

  if (profile.key === "post_based") {
    return resolveScorecardSetup({
      postCount: Number(options.postCount || options.courseCount),
      targetsPerPost: Number(options.targetsPerPost),
      totalTargets: options.totalTargets ?? null,
      targetDefinitions: options.targetDefinitions || [],
    });
  }

  const totalTargets =
    options.totalTargets == null ? null : Number(options.totalTargets);
  const targetsPerSeries = profile.defaultTargetsPerSeries || 25;
  const explicitSeries =
    profile.key === "sporttrap"
      ? Number(options.sporttrapSeriesCount || options.courseCount)
      : Number(options.courseCount || options.postCount);
  const derivedSeries =
    totalTargets && totalTargets % targetsPerSeries === 0
      ? totalTargets / targetsPerSeries
      : NaN;
  const seriesCount =
    Number.isInteger(explicitSeries) && explicitSeries > 0
      ? explicitSeries
      : derivedSeries;
  if (!Number.isInteger(seriesCount) || seriesCount < 1) {
    return {
      ok: false,
      message: `Set up the number of series and ${targetsPerSeries} targets per series before importing a scorecard.`,
    };
  }
  if (
    totalTargets !== null &&
    totalTargets !== seriesCount * targetsPerSeries
  ) {
    return {
      ok: false,
      message: `Saved total targets conflicts with ${seriesCount} series of ${targetsPerSeries}. Review setup before importing.`,
    };
  }
  return resolveScorecardSetup({
    postCount: seriesCount,
    targetsPerPost: targetsPerSeries,
    totalTargets,
    targetDefinitions: [],
  });
}


export async function resolvedDisciplineScorecardSetupFingerprint(options: {
  discipline?: string | null;
  setup: { postCount: number; targetsPerPost: number; targetsPerPostByPost?: number[]; totalTargets: number };
}) {
  const profile = scorecardDisciplineProfile(options.discipline);
  if (!profile) return null;
  const resolvedSetup = normalizeScorecardSetupForFingerprint(
    profile.key,
    options.setup,
  );
  return {
    setupFingerprint: await scorecardSetupFingerprint(resolvedSetup),
    resolvedSetup,
  };
}
