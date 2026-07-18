import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeImportedPostStructure, mapReviewedImportToTrainingScoreSheet, type ImportedCellState, type ImportedScorecardStructure, type ImportedScorecardTarget } from "@/lib/scorecards/importedScorecard";
import type { ScorecardCell } from "@/lib/scorecards/scorecardAnalysis";

export const dynamic = "force-dynamic";

function supabaseForRequest(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  const auth = request.headers.get("authorization") || undefined;
  return createClient(url, key, { global: { headers: auth ? { Authorization: auth } : {} } });
}
function json(body: unknown, status = 200) { return NextResponse.json(body, { status }); }
function requiredString(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function reviewedCellToImportedTarget(cell: ScorecardCell): ImportedScorecardTarget { const cellState: ImportedCellState = cell.result === "hit" ? "hit" : cell.result === "miss" ? "miss" : "uncertain"; return { targetNumber: cell.targetNumber, cellState, result: cell.result === "hit" || cell.result === "miss" ? cell.result : "uncertain", confidence: cell.confidence, rawMark: cell.rawMark }; }
async function cleanupCreatedSheet(supabase: any, sheetId: string | null) { if (sheetId) await supabase.from("training_score_sheets").delete().eq("id", sheetId); }

export async function POST(request: Request) {
  try {
    const supabase = supabaseForRequest(request);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return json({ error: { category: "login_required", message: "Log in to save a Training Score Sheet." } }, 401);
    const body = await request.json();
    if (body.sessionType !== "Training") return json({ error: { category: "wrong_destination", message: "Choose Training to create a Training Score Sheet." } }, 400);
    const grid = Array.isArray(body.grid) ? body.grid as ScorecardCell[] : [];
    const discipline = requiredString(body.discipline);
    const sessionDate = requiredString(body.date);
    if (!discipline) return json({ error: { category: "missing_discipline", message: "Select a discipline before creating the Training Score Sheet." } }, 400);
    if (!sessionDate) return json({ error: { category: "missing_date", message: "Choose a date before creating the Training Score Sheet." } }, 400);
    const analysis = body.analysis;
    const selected = body.selectedShooterCandidateId;
    const row = analysis?.shooterRows?.find((candidate: any) => candidate.candidateId === selected) || analysis?.shooterRows?.[0];
    if (!row || !Array.isArray(row.posts)) return json({ error: { category: "missing_review", message: "Review a detected scorecard before saving." } }, 400);
    const reviewedPostCount = grid.length ? Math.max(...grid.map((cell) => cell.postNumber)) : row.posts.length;
    const posts = Array.from({ length: reviewedPostCount }, (_, index) => { const postNumber = index + 1; const sourcePost = row.posts.find((post: any) => Number(post.postNumber) === postNumber) || {}; const reviewedCells = grid.filter((cell) => cell.postNumber === postNumber); return ({
      postNumber,
      expectedTargets: reviewedCells.length || sourcePost.expectedTargets || sourcePost.targets?.length || sourcePost.detectedPostScore || null,
      detectedScore: sourcePost.detectedPostScore,
      confidence: sourcePost.detectedPostScoreConfidence,
      targets: reviewedCells.map(reviewedCellToImportedTarget),
    }); });
    const imported: ImportedScorecardStructure = { sessionType: "Training", discipline, shooterName: body.shooterName || row.displayName || null, date: sessionDate, shootingGround: requiredString(body.shootingGround), totalTargets: analysis.detectedTotalTargets || analysis.totalTargets || null, totalScore: row.detectedScore || null, posts, warnings: analysis.warnings || [] };
    const normalized = normalizeImportedPostStructure(imported);
    const payload = mapReviewedImportToTrainingScoreSheet(normalized, crypto.randomUUID());
    let createdSheetId: string | null = null;
    const { data: sheet, error: sheetError } = await supabase.from("training_score_sheets").insert({ ...payload.scoreSheet, owner_user_id: userData.user.id }).select("id").single();
    if (sheetError || !sheet) return json({ error: { category: "save_failed", message: "Could not create the Training Score Sheet." } }, 500);
    createdSheetId = sheet.id;
    const shooterId = crypto.randomUUID();
    const totalScore = payload.scores.reduce((sum, score) => sum + score, 0);
    const { error: shooterError } = await supabase.from("training_score_sheet_shooters").insert({ id: shooterId, score_sheet_id: sheet.id, shooter_name: payload.shooter.name, display_order: 0, total_score: totalScore });
    if (shooterError) { await cleanupCreatedSheet(supabase, createdSheetId); return json({ error: { category: "save_failed", message: "Could not save the imported shooter. Your review is still available to retry." } }, 500); }
    const scoreRows = payload.scores.map((score, index) => ({ score_sheet_id: sheet.id, shooter_id: shooterId, post_number: index + 1, score, max_score: payload.scoreSheet.expected_targets_by_post[index] }));
    const { error: scoreError } = await supabase.from("training_score_sheet_scores").insert(scoreRows);
    if (scoreError) { await cleanupCreatedSheet(supabase, createdSheetId); return json({ error: { category: "save_failed", message: "Could not save imported post scores. Your review is still available to retry." } }, 500); }
    const resultRows = Object.entries(payload.targetResults[payload.shooter.localId] || {}).flatMap(([postKey, targets]) => Object.entries(targets).map(([targetKey, result]) => ({ score_sheet_id: sheet.id, shooter_id: shooterId, post_number: Number(postKey), target_number: Number(targetKey), result })));
    if (resultRows.length) {
      const { error: resultError } = await supabase.from("training_score_sheet_target_results").insert(resultRows);
      if (resultError) { await cleanupCreatedSheet(supabase, createdSheetId); return json({ error: { category: "save_failed", message: "Could not save imported target results. Your review is still available to retry." } }, 500); }
    }
    return json({ scoreSheetId: sheet.id, targetResultsInserted: resultRows.length });
  } catch {
    return json({ error: { category: "save_failed", message: "Training import could not be saved. Your review is still on this device." } }, 500);
  }
}
