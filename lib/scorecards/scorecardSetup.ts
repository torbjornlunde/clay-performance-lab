import { SCORECARD_MAX_TOTAL_TARGETS } from "./scorecardAnalysis";

export type ScorecardSetupProfile = "post_based" | "compak" | "sporttrap";

export type ScorecardSetup = {
  postCount: number;
  targetsPerPost: number;
  targetsPerPostByPost?: number[];
};

export type ResolvedScorecardSetup = Required<ScorecardSetup> & { totalTargets: number };

export type NormalizedScorecardSetupFingerprintInput = {
  profile: ScorecardSetupProfile;
  postCount: number;
  targetsPerPostByPost: number[];
  totalTargets: number;
};

export type ScorecardSetupResolution =
  | {
      ok: true;
      setup: ResolvedScorecardSetup;
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
  const positionsByPost = Array.from(
    { length: postCount },
    () => new Set<number>(),
  );
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
      const positions = positionsByPost[post - 1];
      if (positions.has(position)) {
        return {
          ok: false,
          message:
            "Detailed post setup has duplicate target positions. Review post setup before importing.",
        };
      }
      positions.add(position);
    }
  }
  const counts = positionsByPost.map((positions) => positions.size);
  const hasDetailed = counts.some((count) => count > 0);
  for (const [index, positions] of positionsByPost.entries()) {
    if (!positions.size) continue;
    for (let position = 1; position <= positions.size; position += 1) {
      if (!positions.has(position)) {
        return {
          ok: false,
          message:
            "Detailed post setup is incomplete. Target positions must be consecutive from 1 on every post before importing.",
        };
      }
    }
    if (Math.max(...positions) !== positions.size) {
      return {
        ok: false,
        message:
          "Detailed post setup is incomplete. Target positions must be consecutive from 1 on every post before importing.",
      };
    }
    counts[index] = positions.size;
  }
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


export function normalizeScorecardSetupForFingerprint(
  profile: ScorecardSetupProfile,
  setup: ScorecardSetup & { totalTargets?: number },
): NormalizedScorecardSetupFingerprintInput {
  const postCount = Number(setup.postCount);
  const counts = scorecardTargetCounts(setup).map((count) => Number(count));
  const totalTargets =
    setup.totalTargets == null
      ? counts.reduce((sum, count) => sum + count, 0)
      : Number(setup.totalTargets);
  return {
    profile,
    postCount,
    targetsPerPostByPost: counts,
    totalTargets,
  };
}

export function stableScorecardSetupFingerprintSource(
  input: NormalizedScorecardSetupFingerprintInput,
) {
  return JSON.stringify({
    profile: input.profile,
    postCount: input.postCount,
    targetsPerPostByPost: input.targetsPerPostByPost,
    totalTargets: input.totalTargets,
  });
}

export async function scorecardSetupFingerprint(
  input: NormalizedScorecardSetupFingerprintInput,
) {
  const bytes = new TextEncoder().encode(
    stableScorecardSetupFingerprintSource(input),
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
