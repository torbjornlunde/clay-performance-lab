import { SCORECARD_MAX_TOTAL_TARGETS } from "./scorecardAnalysis";

export type ScorecardSetup = {
  postCount: number;
  targetsPerPost: number;
  targetsPerPostByPost?: number[];
};

export type ScorecardSetupResolution =
  | {
      ok: true;
      setup: Required<ScorecardSetup> & { totalTargets: number };
      usedDetailedStructure: boolean;
    }
  | { ok: false; message: string };

type TargetDefinition = {
  post_number: number | null;
  target_position: number | null;
};

export function scorecardTargetCounts(setup: ScorecardSetup) {
  if (
    Array.isArray(setup.targetsPerPostByPost) &&
    setup.targetsPerPostByPost.length === setup.postCount
  ) {
    return setup.targetsPerPostByPost;
  }
  return Array.from({ length: setup.postCount }, () => setup.targetsPerPost);
}

export function scorecardTotalTargets(setup: ScorecardSetup) {
  return scorecardTargetCounts(setup).reduce((sum, count) => sum + count, 0);
}

export function resolveScorecardSetup(options: {
  postCount: number;
  targetsPerPost: number;
  totalTargets: number | null;
  targetDefinitions?: TargetDefinition[] | null;
}): ScorecardSetupResolution {
  const { postCount, targetsPerPost } = options;
  if (
    !Number.isInteger(postCount) ||
    !Number.isInteger(targetsPerPost) ||
    postCount < 1 ||
    targetsPerPost < 1
  ) {
    return {
      ok: false,
      message:
        "Set up the number of posts and targets per post before importing a scorecard.",
    };
  }
  const counts = Array.from({ length: postCount }, () => 0);
  for (const row of options.targetDefinitions || []) {
    const post = Number(row.post_number);
    const position = Number(row.target_position);
    if (
      Number.isInteger(post) &&
      post >= 1 &&
      post <= postCount &&
      Number.isInteger(position) &&
      position >= 1
    ) {
      counts[post - 1] = Math.max(counts[post - 1], position);
    }
  }
  const hasDetailed = counts.some((count) => count > 0);
  if (hasDetailed && counts.some((count) => count < 1)) {
    return {
      ok: false,
      message:
        "Detailed post setup is incomplete. Review every post before importing.",
    };
  }
  const targetsPerPostByPost = counts.map((count) => count || targetsPerPost);
  const totalTargets = targetsPerPostByPost.reduce(
    (sum, count) => sum + count,
    0,
  );
  if (totalTargets > SCORECARD_MAX_TOTAL_TARGETS)
    return { ok: false, message: "This scorecard is too large for v1 import." };
  if (
    options.totalTargets !== null &&
    Number(options.totalTargets) !== totalTargets
  ) {
    return {
      ok: false,
      message: hasDetailed
        ? "Saved total targets conflicts with the detailed post setup. Review post setup before importing."
        : "Saved total targets conflicts with post setup. Review post setup before importing.",
    };
  }
  return {
    ok: true,
    setup: { postCount, targetsPerPost, targetsPerPostByPost, totalTargets },
    usedDetailedStructure: hasDetailed,
  };
}
