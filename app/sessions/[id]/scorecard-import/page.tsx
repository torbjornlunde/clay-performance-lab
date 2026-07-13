"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { recordAnalyticsEvent } from "@/lib/analytics";
import {
  formatScorecardSetupSummary,
  scorecardDisciplineProfile,
  resolveDisciplineScorecardSetup,
  resolvedDisciplineScorecardSetupFingerprint,
} from "@/lib/scorecards/scorecardProfiles";
import {
  applyUserCorrection,
  bulkResolveUnknowns,
  bulkResolveUnknownsForPost,
  confirmCurrentPostReview,
  createReviewPersistenceSnapshot,
  deriveCurrentPostReconciliation,
  findNextReviewPost,
  getPostReviewStatus,
  normalizeReviewProgress,
  resetReviewProgress,
  unresolvedTargetsForPost,
  summarizeGrid,
  type NormalizedScorecardAnalysis,
  type ScorecardCell,
  type ScorecardOutcome,
} from "@/lib/scorecards/scorecardAnalysis";
import {
  deletePendingScorecardPhoto,
  getPendingScorecardPhoto,
  savePendingScorecardPhoto,
  type PendingScorecardPhoto,
} from "@/lib/scorecards/scorecardPhotos";
import {
  cropFromDrag,
  cropToPercent,
  displayedPointToCrop,
  fingerprintCrop,
  fullImageCrop,
  moveCrop,
  renderCropBlob,
  resizeCrop,
  clampCrop,
  isFullImageCrop,
  type NormalizedCrop,
} from "@/lib/scorecards/scorecardCrop";
import {
  canApplyReview,
  canReconnectRetry,
  shouldIgnoreScorecardResponse,
  timeoutMessage,
  type ActiveScorecardOperation,
} from "@/lib/scorecards/scorecardImportState";
import { createOrderedPendingPersistence } from "@/lib/scorecards/orderedPendingPersistence";
import { ContextualHelpCard } from "@/app/components/OnboardingHelp";

const MAX_SOURCE = 15 * 1024 * 1024,
  MAX_UPLOAD = 4 * 1024 * 1024;
async function resizeImage(file: File) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  let blob = await new Promise<Blob>((res) =>
    canvas.toBlob((b) => res(b!), "image/jpeg", 0.82),
  );
  if (blob.size > MAX_UPLOAD)
    blob = await new Promise<Blob>((res) =>
      canvas.toBlob((b) => res(b!), "image/jpeg", 0.68),
    );
  return blob;
}
async function sha256(blob: Blob) {
  const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const camera = useRef<HTMLInputElement>(null),
    library = useRef<HTMLInputElement>(null);
  const active = useRef<ActiveScorecardOperation | null>(null);
  const timerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const [session, setSession] = useState<any>(null);
  const [targetDefinitions, setTargetDefinitions] = useState<
    Array<{ post_number: number | null; target_position: number | null }>
  >([]);
  const [targetDefinitionsError, setTargetDefinitionsError] = useState("");
  const [pending, setPending] = useState<PendingScorecardPhoto | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [grid, setGrid] = useState<ScorecardCell[]>([]);
  const [error, setError] = useState("");
  const [ack, setAck] = useState(false);
  const [currentPost, setCurrentPost] = useState(1);
  const [reviewedPosts, setReviewedPosts] = useState<number[]>([]);
  const [reviewMessage, setReviewMessage] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [scoreChoice, setScoreChoice] = useState<
    "use_scorecard" | "keep_existing"
  >("use_scorecard");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [stage, setStage] = useState("");
  const [currentSetupFingerprint, setCurrentSetupFingerprint] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [crop, setCrop] = useState<NormalizedCrop>(fullImageCrop);
  const [viewer, setViewer] = useState<"analyzed" | "original" | null>(null);
  const pendingRef = useRef<PendingScorecardPhoto | null>(null);
  const persistenceRef = useRef<ReturnType<typeof createOrderedPendingPersistence<PendingScorecardPhoto>> | null>(null);
  function rememberPending(next: PendingScorecardPhoto | null) {
    pendingRef.current = next;
    if (next?.localReviewRevision) persistenceRef.current?.noteRevision(next.localReviewRevision);
    setPending(next);
  }
  function currentPostReconciliation(postNumber: number) {
    const row = pendingRef.current?.analysis?.shooterRows.find((r) => r.candidateId === selected);
    const post = row?.posts.find((x) => x.postNumber === postNumber);
    const cells = grid.filter((c) => c.postNumber === postNumber);
    return deriveCurrentPostReconciliation({
      currentCells: cells,
      detectedPostScore: post?.detectedPostScore ?? null,
      detectedPostScoreConfidence: post?.detectedPostScoreConfidence ?? null,
      expectedTargetCount: cells.length,
      originalStatus: post?.reconciliationStatus,
      originalWarning: post?.reconciliationWarning,
    });
  }
  function postStatusMap() {
    const map: Record<number, any> = {};
    for (let post = 1; post <= (postCount || 0); post++) map[post] = currentPostReconciliation(post).reconciliationStatus;
    return map;
  }
  type PersistenceResult = { ok: true } | { ok: false; error: string };
  function persistence() {
    if (!persistenceRef.current) {
      persistenceRef.current = createOrderedPendingPersistence<PendingScorecardPhoto>({
        write: savePendingScorecardPhoto,
        delete: deletePendingScorecardPhoto,
        currentRecord: () => pendingRef.current,
        remember: rememberPending,
        onStatus: (status, message) => { setSaveStatus(status); if (message) setReviewMessage(message); },
      });
    }
    return persistenceRef.current;
  }
  function nextRevision() { return persistence().nextRevision(); }
  function invalidatePendingGeneration() { return persistence().invalidate(); }
  function enqueuePendingWrite(next: PendingScorecardPhoto, options: { generation?: number; showStatus?: boolean; commit?: boolean } = {}): Promise<PersistenceResult> {
    return persistence().enqueueWrite(next, { generation: options.generation, status: options.showStatus, commit: options.commit });
  }
  function enqueuePendingDelete(sessionId: string, clientImportId: string | null): Promise<PersistenceResult> {
    return persistence().enqueueDelete(sessionId, clientImportId);
  }
  async function flushPendingWrites() { await persistence().flush(); }
  function applyReviewReset(nextGrid: ScorecardCell[], selectedShooterId: string | null, base = pendingRef.current, persist = true) {
    const reset = resetReviewProgress(nextGrid, selectedShooterId);
    setSelected(reset.selectedShooterCandidateId);
    setGrid(reset.reviewedGrid);
    setCurrentPost(reset.currentReviewPost);
    setReviewedPosts(reset.reviewedPostNumbers);
    setAck(Boolean(reset.acknowledgeAmbiguousExisting));
    setReviewMessage("");
    if (base && persist) {
      const revision = nextRevision();
      const next = createReviewPersistenceSnapshot(base, {
        ...reset,
        reviewedGridFingerprint: base.cropFingerprint || base.imageFingerprint,
      }, revision);
      rememberPending(next);
      void enqueuePendingWrite(next);
    }
  }
  useEffect(() => {
    mounted.current = true;
    void load();
    const online = async () => {
      const latest = await getPendingScorecardPhoto(id);
      if (latest && canReconnectRetry(latest)) void analyze(latest);
    };
    window.addEventListener("online", online);
    return () => {
      mounted.current = false;
      window.removeEventListener("online", online);
    };
  }, [id]);
  useEffect(() => {
    if (!pending?.image) {
      setPreviewUrl(null);
      setOriginalUrl(null);
      setOriginalUrl(null);
      return;
    }
    const url = URL.createObjectURL(pending.image);
    const original =
      pending.originalImage && pending.originalImage !== pending.image
        ? URL.createObjectURL(pending.originalImage)
        : url;
    setPreviewUrl(url);
    setOriginalUrl(original);
    return () => {
      URL.revokeObjectURL(url);
      if (original !== url) URL.revokeObjectURL(original);
    };
  }, [pending?.image]);
  async function load() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      router.push("/login");
      return;
    }
    const { data: s } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", id)
      .single();
    setSession(s);
    const loadedProfile = scorecardDisciplineProfile(s?.discipline);
    setTargetDefinitions([]);
    setTargetDefinitionsError("");
    if (loadedProfile?.key === "post_based") {
      const { data: defs, error: defsError } = await supabase
        .from("session_post_targets")
        .select("post_number,target_position")
        .eq("session_id", id)
        .order("post_number")
        .order("target_position");
      if (defsError) {
        setTargetDefinitionsError(
          "Could not load post setup safely before importing. Reopen this page and try again.",
        );
      } else {
        setTargetDefinitions(defs || []);
      }
    }
    const p = await getPendingScorecardPhoto(id);
    if (p) {
      rememberPending(p);
      setCrop(p.crop || fullImageCrop);
      const auto =
        p.analysis?.shooterRows.length === 1 &&
        p.analysis.shooterRows[0].confidence !== "low"
          ? p.analysis.shooterRows[0].candidateId
          : null;
      const savedSelection = p.analysis?.shooterRows.some(
        (r) => r.candidateId === p.selectedShooterCandidateId,
      )
        ? p.selectedShooterCandidateId
        : null;
      const sid = savedSelection || auto || null;
      setSelected(sid || null);
      setAck(Boolean(p.acknowledgeAmbiguousExisting));
      setScoreChoice(p.scoreChoice || "use_scorecard");
      const row = p.analysis?.shooterRows.find((r) => r.candidateId === sid);
      const restoredGrid = p.reviewedGrid || row?.grid || [];
      setGrid(restoredGrid);
      setCurrentPost(p.currentReviewPost || 1);
      setReviewedPosts(p.reviewedPostNumbers || []);
      persistence().noteRevision(p.localReviewRevision || 0);
      if (navigator.onLine && canReconnectRetry(p)) void analyze(p);
    }
  }
  const profile = scorecardDisciplineProfile(session?.discipline);
  const setupResult = session
    ? resolveDisciplineScorecardSetup({
        discipline: session.discipline,
        postCount: session.post_count,
        courseCount: session.course_count,
        sporttrapSeriesCount: session.sporttrap_series_count,
        targetsPerPost: session.targets_per_post,
        totalTargets: session.total_targets,
        targetDefinitions,
      })
    : null;
  const safeSetupResult =
    targetDefinitionsError && profile?.key === "post_based"
      ? null
      : setupResult;
  const setupSummary = safeSetupResult?.ok
    ? formatScorecardSetupSummary(
        safeSetupResult.setup,
        profile?.reviewLabel || "Post",
      )
    : null;
  const postCount = safeSetupResult?.ok
    ? safeSetupResult.setup.postCount
    : Number(session?.post_count || session?.course_count);
  const tpp = safeSetupResult?.ok
    ? safeSetupResult.setup.targetsPerPost
    : Number(session?.targets_per_post || profile?.defaultTargetsPerSeries);
  const setupOk = Boolean(safeSetupResult?.ok);
  useEffect(() => {
    if (!grid.length || !postCount) return;
    const normalized = normalizeReviewProgress({ grid, postCount, currentReviewPost: currentPost, reviewedPostNumbers: reviewedPosts, postStatuses: postStatusMap() });
    if (normalized.currentReviewPost !== currentPost || normalized.reviewedPostNumbers.join(",") !== reviewedPosts.join(",")) {
      setCurrentPost(normalized.currentReviewPost);
      setReviewedPosts(normalized.reviewedPostNumbers);
      if (pendingRef.current) persistReview(grid, { currentReviewPost: normalized.currentReviewPost, reviewedPostNumbers: normalized.reviewedPostNumbers });
    }
  }, [grid.length, postCount, selected]);
  useEffect(() => {
    let cancelled = false;
    async function compute() {
      if (!safeSetupResult?.ok || !session) {
        setCurrentSetupFingerprint(null);
        return;
      }
      const next = await resolvedDisciplineScorecardSetupFingerprint({
        discipline: session.discipline,
        setup: safeSetupResult.setup,
      });
      if (!cancelled) setCurrentSetupFingerprint(next?.setupFingerprint || null);
    }
    void compute();
    return () => {
      cancelled = true;
    };
  }, [safeSetupResult?.ok ? stableSetupKey(session?.discipline, safeSetupResult.setup) : "", session?.discipline]);
  const unsupported = session && !profile;
  const conflict = Boolean(
    session &&
    ((setupResult && !setupResult.ok && profile) || targetDefinitionsError),
  );
  const setupErrorMessage =
    setupResult && !setupResult.ok ? setupResult.message : "";
  const setupVerificationRequired = Boolean(pending?.analysis && !pending.setupFingerprint);
  const setupMismatch = Boolean(
    pending?.analysis &&
      pending.setupFingerprint &&
      currentSetupFingerprint &&
      pending.setupFingerprint !== currentSetupFingerprint,
  );
  const setupBlocksReview = setupVerificationRequired || setupMismatch;
  const summary = summarizeGrid(grid);
  async function choose(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    setError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    if (file.size > MAX_SOURCE) {
      setError("Image file is too large.");
      return;
    }
    if (pending && !confirm("Replace the pending scorecard photo and review?"))
      return;
    const blob = await resizeImage(file);
    if (blob.size > MAX_UPLOAD) {
      setError("Image is still too large after resizing.");
      return;
    }
    void recordAnalyticsEvent(supabase, "scorecard_photo_uploaded", { route: "/sessions/[id]/scorecard-import", feature: "scorecard_import", sessionId: id, metadata: { targetCount: setupResult?.ok ? setupResult.setup.totalTargets : undefined } });
    const clientImportId = crypto.randomUUID();
    const imageFingerprint = await sha256(blob);
    const rec: PendingScorecardPhoto = {
      schemaVersion: 4,
      queueId: clientImportId,
      clientImportId,
      sessionId: id,
      image: blob,
      originalImage: blob,
      analyzedImage: blob,
      mimeType: blob.type,
      imageFingerprint,
      originalImageFingerprint: imageFingerprint,
      crop: fullImageCrop,
      cropFingerprint: imageFingerprint,
      preparationState: "prepare",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: navigator.onLine ? "saved_on_device" : "waiting_for_connection",
    };
    const generation = invalidatePendingGeneration();
    const recWithRevision = { ...rec, localReviewRevision: nextRevision() };
    rememberPending(recWithRevision);
    const saved = await enqueuePendingWrite(recWithRevision, { generation });
    if (!saved.ok) { setError(saved.error); return; }
    setSelected(null);
    setGrid([]);
    setCurrentPost(1);
    setReviewedPosts([]);
    setReviewMessage("");
    setAck(false);
    setScoreChoice("use_scorecard");
    setCrop(fullImageCrop);
    setStage("");
    setElapsed(0);
    // Wait for the user to confirm full image or crop before analysis.
  }
  async function applyCrop(nextCrop = crop, rec = pending) {
    if (!rec || rec.status === "analyzing") return null;
    setError("");
    setSelected(null);
    setGrid([]);
    setCurrentPost(1);
    setReviewedPosts([]);
    setReviewMessage("");
    setAck(false);
    setStage("Preparing image");
    setElapsed(0);
    try {
      const c = clampCrop(nextCrop);
      const source = rec.originalImage || rec.image;
      const analyzedImage = isFullImageCrop(c)
        ? source
        : await renderCropBlob(source, c);
      const cropFingerprint = await fingerprintCrop(analyzedImage);
      const next: PendingScorecardPhoto = {
        ...rec,
        image: analyzedImage,
        analyzedImage,
        crop: c,
        cropFingerprint,
        imageFingerprint: cropFingerprint,
        analysis: undefined,
        reviewedGrid: undefined,
        reviewedGridFingerprint: null,
        setupFingerprint: null,
        resolvedSetup: null,
        selectedShooterCandidateId: null,
        currentReviewPost: 1,
        reviewedPostNumbers: [],
        acknowledgeAmbiguousExisting: false,
        preparationState: "ready",
        status: navigator.onLine ? "saved_on_device" : "waiting_for_connection",
        lastError: null,
      };
      const generation = invalidatePendingGeneration();
      const nextWithRevision = { ...next, localReviewRevision: nextRevision() };
      rememberPending(nextWithRevision);
      const saved = await enqueuePendingWrite(nextWithRevision, { generation });
      if (!saved.ok) throw new Error(saved.error);
      setCrop(c);
      setStage("");
      return nextWithRevision;
    } catch (e: any) {
      setStage("");
      setError(
        e?.message || "Could not prepare the crop. Try another crop or photo.",
      );
      return null;
    }
  }
  async function prepareAndAnalyze(nextCrop = crop, rec = pending) {
    const next = await applyCrop(nextCrop, rec);
    if (next) await analyze(next);
  }
  async function analyze(rec = pending) {
    if (!rec) return;
    const op: ActiveScorecardOperation = {
      sessionId: id,
      clientImportId: rec.clientImportId,
      imageFingerprint: rec.imageFingerprint,
      cropFingerprint: rec.cropFingerprint || rec.imageFingerprint,
      operationId: crypto.randomUUID(),
    };
    if (
      pendingRef.current?.status === "analyzing" &&
      pendingRef.current.clientImportId === rec.clientImportId
    )
      return;
    active.current = op;
    const analyzing = {
      ...rec,
      status: (navigator.onLine
        ? "analyzing"
        : "waiting_for_connection") as any,
      lastError: null,
      analysis: undefined,
      reviewedGrid: undefined,
      reviewedGridFingerprint: null,
      setupFingerprint: null,
      resolvedSetup: null,
      selectedShooterCandidateId: null,
      currentReviewPost: 1,
      reviewedPostNumbers: [],
      acknowledgeAmbiguousExisting: false,
      preparationState: "ready" as const,
    };
    setSelected(null);
    setGrid([]);
    setCurrentPost(1);
    setReviewedPosts([]);
    setReviewMessage("");
    const analyzingGeneration = invalidatePendingGeneration();
    const analyzingWithRevision = { ...analyzing, localReviewRevision: nextRevision() };
    rememberPending(analyzingWithRevision);
    const analyzingSaved = await enqueuePendingWrite(analyzingWithRevision, { generation: analyzingGeneration });
    if (!analyzingSaved.ok) { setError(analyzingSaved.error); return; }
    if (!navigator.onLine) return;
    try {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = window.setInterval(
        () => setElapsed((v) => v + 1),
        1000,
      );
      setElapsed(0);
      setStage("Sending image");
      const {
        data: { session: auth },
      } = await supabase.auth.getSession();
      const fd = new FormData();
      fd.set("image", rec.image, "scorecard.jpg");
      fd.set("imageFingerprint", rec.imageFingerprint);
      const r = await fetch(`/api/sessions/${id}/scorecard/analyze`, {
        method: "POST",
        headers: auth?.access_token
          ? { Authorization: `Bearer ${auth.access_token}` }
          : {},
        body: fd,
        signal: abortRef.current.signal,
      });
      setStage("AI is reading the scorecard");
      const json = await r.json();
      if (
        !mounted.current ||
        shouldIgnoreScorecardResponse(active.current, op, pendingRef.current)
      )
        return;
      if (!r.ok)
        throw new Error(timeoutMessage(json.error?.category, rec.crop));
      setStage("Checking detected results");
      const analysis = json.result as NormalizedScorecardAnalysis;
      const setupFingerprint = typeof json.setupFingerprint === "string" ? json.setupFingerprint : null;
      const auto =
        analysis.shooterRows.length === 1 &&
        analysis.shooterRows[0].confidence !== "low"
          ? analysis.shooterRows[0].candidateId
          : null;
      const ready = {
        ...rec,
        status: "ready_for_review" as const,
        analysis,
        setupFingerprint,
        resolvedSetup: json.resolvedSetup || null,
        selectedShooterCandidateId: auto,
        reviewedGrid: auto ? analysis.shooterRows[0].grid : undefined,
        reviewedGridFingerprint: auto
          ? rec.cropFingerprint || rec.imageFingerprint
          : null,
        currentReviewPost: 1,
        reviewedPostNumbers: [],
        preparationState: "review" as const,
        acknowledgeAmbiguousExisting: false,
        updatedAt: new Date().toISOString(),
      };
      const readyWithRevision = { ...ready, localReviewRevision: nextRevision() };
      rememberPending(readyWithRevision);
      const readySaved = await enqueuePendingWrite(readyWithRevision);
      if (!readySaved.ok) throw new Error(readySaved.error);
      void recordAnalyticsEvent(supabase, "scorecard_analysis_completed", { route: "/sessions/[id]/scorecard-import", feature: "scorecard_import", sessionId: id, metadata: { candidateCount: analysis.shooterRows.length } });
      applyReviewReset(auto ? analysis.shooterRows[0].grid : [], auto, readyWithRevision, false);
      setAck(false);
      setStage("Preparing review");
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    } catch (e: any) {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (e?.name === "AbortError" || active.current?.cancelled) {
        setStage("");
        return;
      }
      const failed = {
        ...rec,
        status: "analysis_failed" as const,
        lastError:
          e.message ||
          "Analysis could not be completed. Your image is still saved on this device.",
        lastSafeErrorCategory: e.message || "analysis_failed",
        updatedAt: new Date().toISOString(),
      };
      if (
        !mounted.current ||
        shouldIgnoreScorecardResponse(active.current, op, pendingRef.current)
      )
        return;
      const failedWithRevision = { ...failed, localReviewRevision: nextRevision() };
      rememberPending(failedWithRevision);
      await enqueuePendingWrite(failedWithRevision);
      void recordAnalyticsEvent(supabase, "error_reported", { route: "/sessions/[id]/scorecard-import", feature: "scorecard_import", sessionId: id, metadata: { errorCategory: "scorecard_analysis" } });
      setError(failed.lastError || "");
      setStage("");
    }
  }
  function selectShooter(cid: string) {
    const row = pending?.analysis?.shooterRows.find(
      (r) => r.candidateId === cid,
    );
    if (!row || !pending) return;
    applyReviewReset(row.grid, cid, pending, true);
  }
  function buildReviewSnapshot(nextGrid: ScorecardCell[], extra: Partial<PendingScorecardPhoto> = {}) {
    if (!pendingRef.current) return null;
    const revision = nextRevision();
    return createReviewPersistenceSnapshot(pendingRef.current, {
      reviewedGrid: nextGrid,
      selectedShooterCandidateId: selected,
      scoreChoice,
      acknowledgeAmbiguousExisting: ack,
      currentReviewPost: currentPost,
      reviewedPostNumbers: reviewedPosts,
      reviewedGridFingerprint: pendingRef.current.cropFingerprint || pendingRef.current.imageFingerprint,
      ...extra,
    }, revision);
  }
  function persistReview(
    nextGrid: ScorecardCell[],
    extra: Partial<PendingScorecardPhoto> = {},
  ): Promise<PersistenceResult> {
    setGrid(nextGrid);
    const next = buildReviewSnapshot(nextGrid, extra);
    if (!next) return Promise.resolve({ ok: false, error: "No pending scorecard review to save." });
    rememberPending(next);
    return enqueuePendingWrite(next);
  }
  function setCell(c: ScorecardCell, result: ScorecardOutcome) {
    persistReview(
      applyUserCorrection(grid, c.postNumber, c.targetNumber, result),
    );
  }
  async function savePostAndNext() {
    const outcome = confirmCurrentPostReview({ grid, currentPost, postCount, reviewedPostNumbers: reviewedPosts, postStatuses: postStatusMap() });
    if (!outcome.ok) {
      const result = await persistReview(grid, { currentReviewPost: currentPost, reviewedPostNumbers: reviewedPosts });
      setReviewMessage(result.ok ? outcome.message : result.error);
      return;
    }
    const next = buildReviewSnapshot(grid, { currentReviewPost: outcome.currentReviewPost, reviewedPostNumbers: outcome.reviewedPostNumbers });
    if (!next) { setReviewMessage("No pending scorecard review to save."); return; }
    const result = await enqueuePendingWrite(next, { commit: false });
    if (!result.ok) { setReviewMessage(result.error); return; }
    rememberPending(next);
    setReviewedPosts(outcome.reviewedPostNumbers);
    setCurrentPost(outcome.currentReviewPost);
    setReviewMessage(outcome.message);
  }
  function navigatePost(post: number) {
    const safe = Math.max(1, Math.min(postCount || 1, post));
    setCurrentPost(safe);
    persistReview(grid, { currentReviewPost: safe, reviewedPostNumbers: reviewedPosts });
  }

  function currentApplyIssues() {
    const issues: Array<{ post: number; message: string }> = [];
    for (let post = 1; post <= (postCount || 0); post++) {
      const cells = grid.filter((c) => c.postNumber === post);
      const rec = currentPostReconciliation(post);
      const status = getPostReviewStatus({ cells, reconciliationStatus: rec.reconciliationStatus, explicitlyReviewed: reviewedPosts.includes(post) });
      if (status === "Conflict") issues.push({ post, message: `Post ${post}: ${rec.reconciliationWarning || "reconciliation conflict"}` });
      else if (status === "Needs review") issues.push({ post, message: `Post ${post}: ${unresolvedTargetsForPost(grid, post).length ? unresolvedTargetsForPost(grid, post).join(", ") + " target(s) still need review" : "needs review"}` });
    }
    return issues;
  }
  async function apply() {
    if (
      !pending ||
      !selected ||
      summary.unknowns > 0 ||
      saveStatus === "saving" ||
      saveStatus === "failed" ||
      currentApplyIssues().some((issue) => issue.message) ||
      !canApplyReview(pending, pending.reviewedGridFingerprint) ||
      setupBlocksReview
    )
      return;
    const {
      data: { session: auth },
    } = await supabase.auth.getSession();
    const applying = {
      ...pending,
      status: "applying" as const,
      reviewedGrid: grid,
      scoreChoice,
      acknowledgeAmbiguousExisting: ack,
      reviewedGridFingerprint: pendingRef.current
        ? pendingRef.current.cropFingerprint ||
          pendingRef.current.imageFingerprint
        : null,
    };
    const previousPending = pendingRef.current;
    const applyingWithRevision = { ...applying, localReviewRevision: nextRevision() };
    rememberPending(applyingWithRevision);
    const applyingSaved = await enqueuePendingWrite(applyingWithRevision);
    if (!applyingSaved.ok) {
      if (previousPending) rememberPending({ ...previousPending, status: "ready_for_review" as const, localReviewRevision: nextRevision() });
      setError(applyingSaved.error);
      return;
    }
    try {
      const r = await fetch(`/api/sessions/${id}/scorecard/apply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(auth?.access_token
            ? { Authorization: `Bearer ${auth.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          clientImportId: pending.clientImportId,
          imageFingerprint: pending.imageFingerprint,
          grid,
          acknowledgeAmbiguousExisting: ack,
          reviewedGridFingerprint: pendingRef.current
            ? pendingRef.current.cropFingerprint ||
              pendingRef.current.imageFingerprint
            : null,
          setupFingerprint: pending.setupFingerprint,
          scoreChoice,
        }),
      });
      const json = await r.json();
      if (!r.ok) {
        throw new Error(json.error?.message || "Apply failed.");
      }
      await flushPendingWrites();
      const deleted = await enqueuePendingDelete(id, pendingRef.current?.clientImportId || null);
      if (!deleted.ok) { setError(`${deleted.error} Import was applied; this local cleanup can be retried safely.`); rememberPending({ ...applyingWithRevision, status: "ready_for_review" as const, lastError: deleted.error, localReviewRevision: nextRevision() }); }
      else rememberPending(null);
      const result = json.result || {};
      const qs = new URLSearchParams({
        score: String(result.score ?? summary.score),
        inserted: String(result.insertedMisses ?? 0),
        skipped: String(result.skippedDuplicates ?? 0),
        alreadyImported: String(Boolean(result.alreadyImported)),
        ownScoreUpdated: String(Boolean(result.ownScoreUpdated)),
      });
      void recordAnalyticsEvent(supabase, "scorecard_review_applied", { route: "/sessions/[id]/scorecard-import", feature: "scorecard_import", sessionId: id, metadata: { scoreChoice, targetCount: grid.length } });
      router.push(`/sessions/${id}/analysis?scorecardImported=1&${qs.toString()}`);
    } catch (e: any) {
      const retryable = {
        ...applyingWithRevision,
        status: "ready_for_review" as const,
        lastError: e.message || "Apply failed",
      };
      const retryableWithRevision = { ...retryable, localReviewRevision: nextRevision() };
      rememberPending(retryableWithRevision);
      await enqueuePendingWrite(retryableWithRevision);
      setError(retryable.lastError || "Apply failed");
    }
  }
  function cancelAnalysis() {
    if (active.current)
      active.current = {
        ...active.current,
        cancelled: true,
        operationId: crypto.randomUUID(),
      };
    abortRef.current?.abort();
    abortRef.current = null;
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setStage("");
    setElapsed(0);
    if (pendingRef.current?.status === "analyzing") {
      const next = {
        ...pendingRef.current,
        status: "saved_on_device" as const,
        analysis: undefined,
        reviewedGrid: undefined,
        reviewedGridFingerprint: null,
        setupFingerprint: null,
        resolvedSetup: null,
        selectedShooterCandidateId: null,
      };
      const nextWithRevision = { ...next, localReviewRevision: nextRevision() };
      rememberPending(nextWithRevision);
      void enqueuePendingWrite(nextWithRevision);
    }
  }
  async function discard() {
    if (confirm("Discard this local scorecard photo and review?")) {
      await flushPendingWrites();
      const deleted = await enqueuePendingDelete(id, pendingRef.current?.clientImportId || null);
      if (!deleted.ok) { setError(deleted.error); return; }
      rememberPending(null);
      setGrid([]);
      setSelected(null);
      setPreviewUrl(null);
      setOriginalUrl(null);
    }
  }
  if (!session)
    return (
      <main>
        <div className="card">Loading...</div>
      </main>
    );
  return (
    <main>
      <div className="card">
        <p className="eyebrow">Import scorecard</p>
        <h2>Import scorecard</h2>
        <p>{session.name}</p>
        <ContextualHelpCard storageKey="scorecard-photo-import">Upload a scorecard photo, crop if needed, review the detected scores, then apply.</ContextualHelpCard>
        <p className="muted">
          {setupOk && setupSummary?.compact
            ? setupSummary.compact
            : setupOk
              ? `Total: ${setupSummary?.total}`
              : "Scorecard setup required"}
        </p>
        {setupOk && setupSummary && !setupSummary.compact && (
          <div className="small muted">
            {setupSummary.lines.map((line) => (
              <div key={line}>{line}</div>
            ))}
            <strong>Total: {setupSummary.total}</strong>
          </div>
        )}
        <Link className="button secondary smallButton" href={`/sessions/${id}`}>
          Back to competition
        </Link>
      </div>
      {unsupported && (
        <div className="card error">
          Scorecard photo import is not available for this discipline.
        </div>
      )}
      {!unsupported && !setupOk && (
        <div className="card">
          <p>
            Set up the number of series/lanes and targets before importing a
            scorecard.
          </p>
          <Link className="button" href={`/sessions/${id}/targets`}>
            Open post setup
          </Link>
        </div>
      )}
      {conflict && (
        <div className="card error">
          {targetDefinitionsError ||
            setupErrorMessage ||
            "Saved total targets conflicts with the scorecard setup. Review setup before applying."}{" "}
          <Link href={`/sessions/${id}/targets`}>Open setup</Link>
        </div>
      )}
      {!unsupported && setupOk && (
        <>
          <div className="card">
            <h3>Capture card</h3>
            <p className="muted">
              Existing misses will be preserved and exact duplicates skipped.
              The image is analyzed but not stored in Supabase Storage or the
              database.
            </p>
            <div className="btns">
              <button
                type="button"
                className="button"
                onClick={() => camera.current?.click()}
              >
                Take photo
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => library.current?.click()}
              >
                Choose from library
              </button>
            </div>
            <input
              ref={camera}
              hidden
              type="file"
              accept="image/*"
              capture="environment"
              onChange={choose}
            />
            <input
              ref={library}
              hidden
              type="file"
              accept="image/*"
              onChange={choose}
            />
            {pending && (
              <p className="small muted">{statusCopy(pending.status)}</p>
            )}
            <div className="btns">
              {pending && (
                <button
                  type="button"
                  className="button secondary smallButton"
                  onClick={() => analyze(pending)}
                  disabled={pending.status === "analyzing"}
                >
                  {setupBlocksReview
                    ? "Analyze saved image again"
                    : pending.status === "analysis_failed"
                      ? "Retry analysis"
                      : "Analyze prepared image"}
                </button>
              )}
              {pending && (
                <button
                  type="button"
                  className="button secondary smallButton"
                  onClick={discard}
                >
                  Discard
                </button>
              )}
            </div>
            {error && <div className="error">{error}</div>}
          </div>
          {previewUrl && (
            <div className="card">
              <h3>Prepare scorecard image</h3>
              <p className="small muted">
                Crop around one shooter’s name and complete score grid. Include
                all series/lanes and target columns.
              </p>
              <div className="btns">
                <button
                  type="button"
                  className="button"
                  onClick={() => applyCrop(fullImageCrop)}
                >
                  Reset to full image
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() =>
                    setCrop({
                      x: 0.05,
                      y: 0.05,
                      width: 0.9,
                      height: 0.9,
                      mode: "crop",
                    })
                  }
                >
                  Crop to my scorecard
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => applyCrop(crop)}
                >
                  Apply crop
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setCrop(pending?.crop || fullImageCrop)}
                >
                  Cancel crop edit
                </button>
              </div>
              <CropOverlay
                imageUrl={originalUrl || previewUrl}
                crop={crop}
                onChange={setCrop}
              />
              <div className="btns">
                <button
                  type="button"
                  className="button"
                  onClick={() => analyze(pending)}
                  disabled={!pending || pending.status === "analyzing"}
                >
                  Analyze prepared image
                </button>
              </div>
              {pending?.status === "analyzing" && (
                <div className="analysisProgress">
                  <strong>
                    {stage || "Analyzing"}
                    {elapsed > 0 ? ` · ${elapsed} seconds` : ""}
                  </strong>
                  <div className="indeterminateBar" />
                  <p className="small muted">
                    Large or detailed images can take up to about a minute.
                  </p>
                  <button
                    type="button"
                    className="secondary smallButton"
                    onClick={cancelAnalysis}
                  >
                    Cancel analysis
                  </button>
                </div>
              )}
              <img
                alt="Selected scorecard"
                style={{ maxWidth: "100%", borderRadius: 12 }}
                src={previewUrl}
              />
            </div>
          )}
          {setupBlocksReview && pending?.analysis && (
            <div className="card error">
              Post setup has changed since this scorecard was analyzed. Analyze the saved image again before continuing. The saved image is still on this device.
              <div className="btns">
                <button type="button" className="button" onClick={() => analyze(pending)} disabled={pending.status === "analyzing"}>
                  Analyze saved image again
                </button>
              </div>
            </div>
          )}
          {pending?.analysis && pending.analysis.shooterRows.length > 1 && !setupBlocksReview && (
            <div className="card">
              <h3>Shooter row</h3>
              {pending.analysis.shooterRows.map((r) => (
                <button
                  type="button"
                  key={r.candidateId}
                  className={`button ${selected === r.candidateId ? "" : "secondary"}`}
                  onClick={() => selectShooter(r.candidateId)}
                >
                  {r.displayName || r.rowLabel || r.candidateId} · score{" "}
                  {r.detectedScore ?? "?"} · {r.confidence}
                </button>
              ))}
            </div>
          )}
          {grid.length > 0 && !setupBlocksReview && (
            <div className="card">
              <div className="reviewReferenceBar">
                <button
                  type="button"
                  className="thumbnailButton"
                  onClick={() => setViewer("analyzed")}
                >
                  <img
                    src={previewUrl || ""}
                    alt="Analyzed scorecard crop thumbnail"
                  />
                </button>
                <span>
                  AI analyzed{" "}
                  {isFullImageCrop(pending?.crop)
                    ? "the full image"
                    : "this crop"}
                </span>
                <button
                  type="button"
                  className="secondary smallButton"
                  onClick={() => setViewer("analyzed")}
                >
                  View photo
                </button>
                {!isFullImageCrop(pending?.crop) && (
                  <button
                    type="button"
                    className="secondary smallButton"
                    onClick={() => setViewer("original")}
                  >
                    View original photo
                  </button>
                )}
              </div>
              {viewer && previewUrl && (
                <div className="imageLightbox" role="dialog" aria-modal="true">
                  <button type="button" className="button" onClick={() => setViewer(null)}>
                    Close
                  </button>
                  <img
                    src={
                      viewer === "original"
                        ? originalUrl || previewUrl
                        : previewUrl
                    }
                    alt="Scorecard reference"
                  />
                </div>
              )}
              <h3>Review one {profile?.reviewLabel?.toLowerCase() || "post"} at a time</h3>
              <p>
                {saveStatus === "saving" ? "Saving on device" : saveStatus === "failed" ? "Save failed" : "Saved on this device"} · Score {summary.score}/{summary.totalTargets} · Unknown {summary.unknowns}
              </p>
              <div className="postNavigator" aria-label="Scorecard post navigator">
                {Array.from({ length: postCount }, (_, pi) => {
                  const post = pi + 1;
                  const postCells = grid.filter((c) => c.postNumber === post);
                  const postSummary = summarizeGrid(postCells);
                  const postMeta = pending?.analysis?.shooterRows.find((r) => r.candidateId === selected)?.posts.find((x) => x.postNumber === post);
                  const currentRec = currentPostReconciliation(post); const status = getPostReviewStatus({ cells: postCells, reconciliationStatus: currentRec.reconciliationStatus, explicitlyReviewed: reviewedPosts.includes(post) });
                  return <button type="button" key={post} className={`postNavButton ${post === currentPost ? "selected" : ""}`} onClick={() => navigatePost(post)}>
                    <strong>{profile?.reviewLabel || "Post"} {post}</strong>
                    <span>{postSummary.score}/{postCells.length} · {status}</span>
                  </button>;
                })}
              </div>
              {(() => {
                const postCells = grid.filter((c) => c.postNumber === currentPost);
                const postSummary = summarizeGrid(postCells);
                const postMeta = pending?.analysis?.shooterRows.find((r) => r.candidateId === selected)?.posts.find((x) => x.postNumber === currentPost);
                const unknownCount = postCells.filter((c) => c.result === "unknown").length;
                const detectedPostScore = postMeta?.detectedPostScore ?? null;
                const detectedConfidence = postMeta?.detectedPostScoreConfidence ? `${postMeta.detectedPostScoreConfidence[0].toUpperCase()}${postMeta.detectedPostScoreConfidence.slice(1)} confidence` : "confidence not read";
                const currentRec = currentPostReconciliation(currentPost);
                return <div className="subcard currentScorecardPost">
                  <h4>{profile?.reviewLabel || "Post"} {currentPost}</h4>
                  <p className="small">Detected post score: <strong>{detectedPostScore === null ? "Not read" : `${detectedPostScore}/${postCells.length}`}</strong> · {detectedConfidence} · Current reviewed score: <strong>{postSummary.score}/{postCells.length}</strong></p>
                  {detectedPostScore !== null && detectedPostScore !== postSummary.score && <div className="warning small">Detected post score and reviewed score differ. Review this post before applying.</div>}
                  {currentRec.reconciliationWarning && <div className="warning small">{currentRec.reconciliationWarning}</div>}
                  <div className="scorecardGrid">
                    {postCells.map((c) => (
                      <button
                        type="button"
                        key={`${c.postNumber}-${c.targetNumber}`}
                        className={`scorecardCell ${c.result}`}
                        onClick={() => setCell(c, c.result === "hit" ? "miss" : c.result === "miss" ? "unknown" : "hit")}
                      >
                        <strong>{c.targetNumber}</strong>
                        <span>{c.result}</span>
                        {c.observedMarkCategory && <small>{c.observedMarkCategory.replace("_", " ")}</small>}
                        {c.confidence !== "high" && <small>{c.confidence}</small>}
                      </button>
                    ))}
                  </div>
                  {reviewMessage && <div className={saveStatus === "failed" ? "error small" : "notice small"}>{reviewMessage}</div>}
                  <div className="btns">
                    <button type="button" className="button secondary smallButton" disabled={currentPost <= 1} onClick={() => navigatePost(currentPost - 1)}>Previous</button>
                    <button type="button" className="button secondary smallButton" disabled={currentPost >= postCount} onClick={() => navigatePost(currentPost + 1)}>Next</button>
                    <button type="button" className="button" onClick={savePostAndNext}>Save post and next</button>
                  </div>
                  <div className="btns">
                    <button type="button" className="button secondary smallButton" disabled={!unknownCount} onClick={() => persistReview(bulkResolveUnknownsForPost(grid, currentPost, "hit", confirm(`Mark ${unknownCount} unknown targets in ${profile?.reviewLabel || "Post"} ${currentPost} as hit?`)).grid)}>Mark unknowns in {profile?.reviewLabel || "Post"} {currentPost} as hit</button>
                    <button type="button" className="button secondary smallButton" disabled={!unknownCount} onClick={() => persistReview(bulkResolveUnknownsForPost(grid, currentPost, "miss", confirm(`Mark ${unknownCount} unknown targets in ${profile?.reviewLabel || "Post"} ${currentPost} as miss?`)).grid)}>Mark unknowns in {profile?.reviewLabel || "Post"} {currentPost} as miss</button>
                  </div>
                </div>;
              })()}
              <details className="scorecardAdvancedBulk">
                <summary>Advanced whole-card actions</summary>
                <div className="btns">
                  <button type="button" className="button secondary smallButton" onClick={() => persistReview(bulkResolveUnknowns(grid, "hit", confirm(`Advanced action: mark all ${summary.unknowns} unknown targets on the whole card as hit?`)).grid)}>Mark all unknown as hit</button>
                  <button type="button" className="button secondary smallButton" onClick={() => persistReview(bulkResolveUnknowns(grid, "miss", confirm(`Advanced action: mark all ${summary.unknowns} unknown targets on the whole card as miss?`)).grid)}>Mark all unknown as miss</button>
                </div>
              </details>
              <div className="subcard finalScorecardSummary">
                <h4>Final review</h4>
                {(() => {
                  const row = pending?.analysis?.shooterRows.find((r) => r.candidateId === selected);
                  const detected = row?.detectedScore ?? null;
                  const official = typeof session.own_score === "number" ? session.own_score : null;
                  const diffDetected = detected === null ? "Not read" : `${summary.score - detected >= 0 ? "+" : ""}${summary.score - detected}`;
                  const diffOfficial = official === null ? "Not recorded" : `${summary.score - official >= 0 ? "+" : ""}${summary.score - official}`;
                  return <div className="compactSummary">
                    <p><strong>Reviewed score:</strong> {summary.score}/{summary.totalTargets}</p>
                    <p><strong>Detected score:</strong> {detected === null ? "Not read" : `${detected}/${summary.totalTargets}`}</p>
                    <p><strong>Existing official score:</strong> {official === null ? "Not recorded" : `${official}/${summary.totalTargets}`}</p>
                    <p><strong>Difference from detected:</strong> {diffDetected}</p>
                    <p><strong>Difference from official:</strong> {diffOfficial}</p>
                    <p><strong>Hits:</strong> {summary.hits} · <strong>Misses:</strong> {summary.misses} · <strong>Unknowns:</strong> {summary.unknowns}</p>
                  </div>;
                })()}
                <div className="compactSummary">
                  {Array.from({ length: postCount }, (_, pi) => { const post = pi + 1; const postCells = grid.filter((c) => c.postNumber === post); const ps = summarizeGrid(postCells); const postMeta = pending?.analysis?.shooterRows.find((r) => r.candidateId === selected)?.posts.find((x) => x.postNumber === post); const currentRec = currentPostReconciliation(post); const status = getPostReviewStatus({ cells: postCells, reconciliationStatus: currentRec.reconciliationStatus, explicitlyReviewed: reviewedPosts.includes(post) }); return <button type="button" className="postSummaryButton" key={post} onClick={() => navigatePost(post)}>{profile?.reviewLabel || "Post"} {post}: {ps.score}/{ps.totalTargets} · {status}</button>; })}
                </div>
              </div>
              {pending?.analysis?.warnings?.map((w) => (
                <p className="small muted" key={w}>
                  {w}
                </p>
              ))}
              <details className="scorecardRawTextDetails">
                <summary>Raw detected text</summary>
                <p className="small scorecardRawText">
                  {pending?.analysis?.rawText || "No raw text."}
                </p>
              </details>
              {summary.unknowns > 0 && (
                <div className="error">
                  {unresolvedTargetsText(grid)}
                </div>
              )}
              <label className="checkboxRow">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => {
                    setAck(e.target.checked);
                    if (pendingRef.current) {
                      const next = {
                        ...pendingRef.current,
                        acknowledgeAmbiguousExisting: e.target.checked,
                        localReviewRevision: nextRevision(),
                      };
                      rememberPending(next);
                      void enqueuePendingWrite(next);
                    }
                  }}
                />
                <span>I understand ambiguous existing misses will be preserved.</span>
              </label>
              {session.own_score !== null &&
                session.own_score !== summary.score && (
                  <div>
                    <p>
                      Existing official score is {session.own_score}; scorecard
                      score is {summary.score}.
                    </p>
                    <select
                      value={scoreChoice}
                      onChange={(e) => {
                        const value = e.target.value as
                          | "use_scorecard"
                          | "keep_existing";
                        setScoreChoice(value);
                        if (pendingRef.current) {
                          const next = {
                            ...pendingRef.current,
                            scoreChoice: value,
                            localReviewRevision: nextRevision(),
                          };
                          rememberPending(next);
                          void enqueuePendingWrite(next);
                        }
                      }}
                    >
                      <option value="keep_existing">
                        Keep existing official score
                      </option>
                      <option value="use_scorecard">Use scorecard score</option>
                    </select>
                  </div>
                )}
              {currentApplyIssues().length > 0 && (
                <div className="error">
                  <strong>Scorecard cannot be applied:</strong>
                  {currentApplyIssues().map((issue) => <button type="button" className="postSummaryButton" key={issue.post} onClick={() => navigatePost(issue.post)}>{issue.message}</button>)}
                </div>
              )}
              <div className="stickyApplyBar">
                <button
                  type="button"
                  className="button"
                  disabled={
                    !selected ||
                    summary.unknowns > 0 ||
                    saveStatus === "saving" ||
                    saveStatus === "failed" ||
                    currentApplyIssues().some((issue) => issue.message) ||
                    pending?.status === "applying" ||
                    !canApplyReview(
                      pending,
                      pending?.reviewedGridFingerprint,
                    ) ||
                    conflict ||
                    setupBlocksReview
                  }
                  onClick={apply}
                >
                  {pending?.status === "applying"
                    ? "Applying..."
                    : "Apply reviewed scorecard"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}

function unresolvedTargetsText(grid: ScorecardCell[]) {
  const unknowns = grid.filter((c) => c.result === "unknown");
  if (!unknowns.length) return "All targets are resolved.";
  const byPost = new Map<number, number[]>();
  for (const cell of unknowns) byPost.set(cell.postNumber, [...(byPost.get(cell.postNumber) || []), cell.targetNumber]);
  return `${unknowns.length} targets still need review: ${Array.from(byPost.entries()).map(([post, targets]) => `Post ${post}: target${targets.length === 1 ? "" : "s"} ${targets.join(", ")}`).join("; ")}`;
}

function CropOverlay({
  imageUrl,
  crop,
  onChange,
}: {
  imageUrl: string;
  crop: NormalizedCrop;
  onChange: (crop: NormalizedCrop) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    crop: NormalizedCrop;
    mode: "draw" | "move" | "nw" | "ne" | "sw" | "se";
  } | null>(null);
  function point(event: React.PointerEvent) {
    const rect = boxRef.current?.getBoundingClientRect();
    return rect
      ? displayedPointToCrop(event.clientX, event.clientY, rect)
      : { x: 0, y: 0 };
  }
  function capture(event: React.PointerEvent) {
    boxRef.current?.setPointerCapture(event.pointerId);
  }
  function start(
    event: React.PointerEvent,
    mode: "draw" | "move" | "nw" | "ne" | "sw" | "se",
  ) {
    event.preventDefault();
    event.stopPropagation();
    capture(event);
    const p = point(event);
    dragRef.current = { startX: p.x, startY: p.y, crop: clampCrop(crop), mode };
    if (mode === "draw") onChange(cropFromDrag(p.x, p.y, p.x, p.y));
  }
  function move(event: React.PointerEvent) {
    if (!dragRef.current) return;
    event.preventDefault();
    const p = point(event),
      d = dragRef.current;
    const dx = p.x - d.startX,
      dy = p.y - d.startY;
    onChange(
      d.mode === "draw"
        ? cropFromDrag(d.startX, d.startY, p.x, p.y)
        : d.mode === "move"
          ? moveCrop(d.crop, dx, dy)
          : resizeCrop(d.crop, d.mode, dx, dy),
    );
  }
  function stop(event: React.PointerEvent) {
    dragRef.current = null;
    try {
      boxRef.current?.releasePointerCapture(event.pointerId);
    } catch {}
  }
  return (
    <div
      className="cropSurface"
      ref={boxRef}
      onPointerDown={(e) => start(e, "draw")}
      onPointerMove={move}
      onPointerUp={stop}
      onPointerCancel={stop}
    >
      <img src={imageUrl} alt="Scorecard crop preview" draggable={false} />
      <div className="cropShade" />
      <div
        className="cropFrame"
        style={cropToPercent(crop)}
        onPointerDown={(e) => start(e, "move")}
        role="group"
        aria-label="Selected scorecard crop"
      >
        {(["nw", "ne", "sw", "se"] as const).map((handle) => (
          <button
            key={handle}
            type="button"
            className={`cropHandle ${handle}`}
            aria-label={`Resize crop ${handle}`}
            onPointerDown={(e) => start(e, handle)}
          />
        ))}
      </div>
    </div>
  );
}

function statusCopy(status: string) {
  return (
    (
      {
        saved_on_device: "Saved on this device — ready to analyze",
        waiting_for_connection:
          "Saved on this device — analysis will start when you are online.",
        analyzing: "Analyzing",
        ready_for_review: "Ready to review",
        analysis_failed:
          "Analysis could not be completed. Your image is still saved on this device.",
        applying: "Applying import",
      } as Record<string, string>
    )[status] || "Saved on this device"
  );
}

function stableSetupKey(discipline: string | null | undefined, setup: { postCount: number; targetsPerPost: number; targetsPerPostByPost?: number[]; totalTargets?: number }) {
  return JSON.stringify({ discipline, postCount: setup.postCount, targetsPerPost: setup.targetsPerPost, targetsPerPostByPost: setup.targetsPerPostByPost || [], totalTargets: setup.totalTargets });
}
