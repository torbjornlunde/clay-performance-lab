import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isScorecardImportDiscipline, resolveDisciplineScorecardSetup, resolvedDisciplineScorecardSetupFingerprint } from "@/lib/scorecards/scorecardProfiles";
import {
  canonicalizeReviewedGrid,
  summarizeGrid,
  type ScorecardCell,
} from "@/lib/scorecards/scorecardAnalysis";
import { mapReviewedMisses } from "@/lib/scorecards/scorecardMissMapping";

export const dynamic = "force-dynamic";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fingerprint = /^[a-f0-9]{64}$/i;
const scoreChoices = new Set(["use_scorecard", "keep_existing"]);
const MAX_DISCOVERY_POSTS = 100;
const MAX_DISCOVERY_TARGETS_PER_POST = 100;
const MAX_DISCOVERY_TOTAL_TARGETS = 500;

function supabaseForRequest(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing Supabase environment variables.");
  const authorization = request.headers.get("authorization") || undefined;
  return createClient(url, key, {
    global: {
      headers: authorization ? { Authorization: authorization } : {},
    },
  });
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

function safeRpcError(message?: string) {
  const code = (message || "").trim().toLowerCase();
  if (code.includes("login_required")) {
    return json(
      { error: { category: "login_required", message: "Log in to apply a scorecard." } },
      401,
    );
  }
  if (code.includes("forbidden") || code.includes("access_not_approved")) {
    return json(
      { error: { category: "forbidden", message: "You do not have access to apply this scorecard." } },
      403,
    );
  }
  if (code.includes("unsupported_discipline")) {
    return json(
      { error: { category: "unsupported_discipline", message: "Scorecard import is not available for this discipline." } },
      422,
    );
  }
  if (
    code.includes("dimension_mismatch") ||
    code.includes("total_targets_conflict") ||
    code.includes("stale_score")
  ) {
    return json(
      {
        error: {
          category: "setup_changed",
          message: "The saved competition setup or score changed. Reload the competition and review the import again.",
        },
      },
      409,
    );
  }
  return json(
    {
      error: {
        category: "analysis_failed",
        message: "The scorecard import could not be applied safely. Your review is still saved on this device.",
      },
    },
    400,
  );
}

function deriveSetupFromReviewedGrid(grid: ScorecardCell[]) {
  const errors: string[] = [];
  if (!Array.isArray(grid) || !grid.length) return { ok: false as const, message: "Review grid is missing.", errors };
  const byPost = new Map<number, Set<number>>();
  for (const cell of grid) {
    const post = Number(cell?.postNumber), target = Number(cell?.targetNumber);
    if (!Number.isInteger(post) || post < 1 || post > MAX_DISCOVERY_POSTS) errors.push(`Invalid post ${cell?.postNumber}.`);
    if (!Number.isInteger(target) || target < 1 || target > MAX_DISCOVERY_TARGETS_PER_POST) errors.push(`Invalid target ${cell?.targetNumber}.`);
    if (cell?.result !== "hit" && cell?.result !== "miss") errors.push(`Target ${post}:${target} must be reviewed as hit or miss.`);
    if (errors.length) continue;
    const set = byPost.get(post) || new Set<number>();
    if (set.has(target)) errors.push(`Duplicate target coordinate ${post}:${target}.`);
    set.add(target); byPost.set(post, set);
  }
  const postCount = byPost.size ? Math.max(...byPost.keys()) : 0;
  if (postCount < 1 || postCount > MAX_DISCOVERY_POSTS) errors.push("Scorecard must have 1–100 posts.");
  const counts: number[] = [];
  for (let post = 1; post <= postCount; post++) {
    const positions = byPost.get(post);
    if (!positions?.size) { errors.push(`Missing post ${post}.`); counts.push(0); continue; }
    const max = Math.max(...positions);
    if (max !== positions.size) errors.push(`Post ${post} target positions must be consecutive from 1.`);
    for (let target = 1; target <= max; target++) if (!positions.has(target)) errors.push(`Missing target ${post}:${target}.`);
    counts.push(max);
  }
  const totalTargets = counts.reduce((sum, count) => sum + count, 0);
  if (counts.some((count) => count < 1 || count > MAX_DISCOVERY_TARGETS_PER_POST) || totalTargets < 1 || totalTargets > MAX_DISCOVERY_TOTAL_TARGETS) errors.push("Discovered scorecard structure must be 1–100 targets per post and 500 targets or fewer.");
  if (errors.length) return { ok: false as const, message: "Reviewed scorecard structure is invalid.", errors };
  return { ok: true as const, setup: { postCount, targetsPerPost: Math.max(...counts), targetsPerPostByPost: counts, totalTargets } };
}

function structuralTargetsFromSetup(setup: { postCount: number; targetsPerPostByPost: number[] }) {
  return setup.targetsPerPostByPost.flatMap((count, index) => Array.from({ length: count }, (_, targetIndex) => ({ post_number: index + 1, target_position: targetIndex + 1, presentation_number: targetIndex + 1, presentation_type: null, position_in_presentation: null, target_label: null, target_type: null })));
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const supabase = supabaseForRequest(request);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return json(
        { error: { category: "login_required", message: "Log in to apply a scorecard." } },
        401,
      );
    }

    const body = await request.json();
    const setupMode = body.setupMode === "discovery" ? "discovery" : "known";
    if (!uuid.test(body.clientImportId) || !fingerprint.test(body.imageFingerprint) || (setupMode === "known" && !fingerprint.test(body.setupFingerprint || ""))) {
      return json(
        { error: { category: "analysis_failed", message: "Invalid import identifiers or setup fingerprint." } },
        400,
      );
    }
    if (!scoreChoices.has(body.scoreChoice)) {
      return json(
        { error: { category: "analysis_failed", message: "Choose how the reviewed score should be saved." } },
        400,
      );
    }

    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", id)
      .single();
    if (sessionError || !session || session.user_id !== userData.user.id) {
      return json(
        { error: { category: "forbidden", message: "You do not have access to this session." } },
        403,
      );
    }
    if (!isScorecardImportDiscipline(session.discipline)) {
      return json(
        { error: { category: "unsupported_discipline", message: "Scorecard import is not available for this discipline." } },
        422,
      );
    }

    const targetResult = await supabase
      .from("session_post_targets")
      .select(
        "post_number,target_position,presentation_number,presentation_type,position_in_presentation,target_label,target_type",
      )
      .eq("session_id", id);
    if (targetResult.error) {
      return json({ error: { category: "setup_required", message: "Could not load post setup safely before applying." } }, 500);
    }
    const setupResult = resolveDisciplineScorecardSetup({
      discipline: session.discipline,
      postCount: session.post_count,
      courseCount: session.course_count,
      sporttrapSeriesCount: session.sporttrap_series_count,
      targetsPerPost: session.targets_per_post,
      totalTargets: session.total_targets,
      targetDefinitions: targetResult.data || [],
    });
    const hasNoSavedPostSetup =
      !targetResult.data?.length &&
      !session.post_count &&
      !session.course_count &&
      !session.targets_per_post;
    const discoveryApply = setupMode === "discovery" && !setupResult.ok && hasNoSavedPostSetup;
    if (!setupResult.ok && !discoveryApply) {
      return json({ error: { category: setupMode === "discovery" ? "scorecard_setup_changed" : "setup_required", message: setupMode === "discovery" ? "Competition setup was created or changed after analysis. Analyze the saved image again before continuing." : setupResult.message } }, setupMode === "discovery" ? 409 : 409);
    }
    if (setupMode === "discovery" && setupResult.ok) {
      return json({ error: { category: "scorecard_setup_changed", message: "Competition setup was created or changed after analysis. Analyze the saved image again before continuing." } }, 409);
    }
    const setup = discoveryApply
      ? deriveSetupFromReviewedGrid(body.grid as ScorecardCell[])
      : ({ ok: true as const, setup: (setupResult as Extract<typeof setupResult, { ok: true }>).setup, errors: [] as string[] });
    if (!setup.ok) return json({ error: { category: "analysis_failed", message: setup.message, details: setup.errors?.slice(0, 10) } }, 400);
    const resolvedSetup = setup.setup;
    if (!discoveryApply) {
      const fingerprintResult = await resolvedDisciplineScorecardSetupFingerprint({ discipline: session.discipline, setup: resolvedSetup });
      if (!fingerprintResult || fingerprintResult.setupFingerprint !== body.setupFingerprint) {
        return json({ error: { category: "scorecard_setup_changed", message: "Post setup has changed since this scorecard was analyzed. Analyze the saved image again before continuing." } }, 409);
      }
    }

    const canonical = canonicalizeReviewedGrid(body.grid as ScorecardCell[], resolvedSetup);
    if (!canonical.ok) {
      return json(
        {
          error: {
            category: "analysis_failed",
            message: "Review grid must contain exactly one reviewed hit/miss cell for every expected target.",
            details: canonical.errors.slice(0, 10),
          },
        },
        400,
      );
    }

    const clean = canonical.grid;
    const summary = summarizeGrid(clean);
    if (summary.unknowns > 0) {
      return json(
        { error: { category: "analysis_failed", message: "Unknown cells block apply." } },
        400,
      );
    }

    const missResult = await supabase
      .from("misses")
      .select(
        "course_number,target_position,target_number,missed_target,source_type",
      )
      .eq("session_id", id);
    if (missResult.error) {
      return json(
        {
          error: {
            category: "analysis_failed",
            message: "Could not load existing target or miss data safely.",
          },
        },
        500,
      );
    }

    const mapped = mapReviewedMisses(
      clean,
      discoveryApply ? structuralTargetsFromSetup(resolvedSetup) : targetResult.data || [],
      missResult.data || [],
    );
    if (mapped.ambiguousExisting && !body.acknowledgeAmbiguousExisting) {
      return json(
        {
          error: {
            category: "ambiguous_existing_misses",
            message:
              "Some existing misses could not be matched to an exact target position. They will be kept. Review the final miss list for possible duplicates.",
          },
          duplicatePreview: mapped,
        },
        409,
      );
    }

    const useScorecardScore =
      body.scoreChoice === "use_scorecard" &&
      (session.own_score === null ||
        session.own_score === summary.score ||
        body.scoreChoice === "use_scorecard");
    const reviewedMissPositions = clean
      .filter((cell) => cell.result === "miss")
      .map((cell) => ({
        course_number: cell.postNumber,
        target_position: cell.targetNumber,
      }));

    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "apply_scorecard_import_v2",
      {
        p_session_id: id,
        p_client_import_id: body.clientImportId,
        p_image_fingerprint: body.imageFingerprint,
        p_post_count: resolvedSetup.postCount,
        p_targets_per_post: resolvedSetup.targetsPerPost,
        p_targets_per_post_by_post: resolvedSetup.targetsPerPostByPost,
        p_reviewed_hits: summary.hits,
        p_reviewed_misses: summary.misses,
        p_reviewed_miss_positions: reviewedMissPositions,
        p_use_scorecard_score: useScorecardScore,
        p_expected_own_score: session.own_score,
        p_misses: mapped.rows,
        p_discovery_mode: discoveryApply,
      },
    );
    if (rpcError) return safeRpcError(rpcError.message);

    return json({ result: rpcResult });
  } catch {
    return json(
      { error: { category: "analysis_failed", message: "Apply failed. Your review is still saved on this device." } },
      500,
    );
  }
}
