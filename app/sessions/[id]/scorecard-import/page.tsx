"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
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
  cropToPercent,
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
  function rememberPending(next: PendingScorecardPhoto | null) {
    pendingRef.current = next;
    setPending(next);
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
      const sid =
        p.selectedShooterCandidateId ||
        (p.analysis?.shooterRows.length === 1 &&
        p.analysis.shooterRows[0].confidence !== "low"
          ? p.analysis.shooterRows[0].candidateId
          : null);
      setSelected(sid || null);
      setAck(Boolean(p.acknowledgeAmbiguousExisting));
      setScoreChoice(p.scoreChoice || "use_scorecard");
      const row = p.analysis?.shooterRows.find((r) => r.candidateId === sid);
      setGrid(p.reviewedGrid || row?.grid || []);
      setCurrentPost(p.currentReviewPost || 1);
      setReviewedPosts(p.reviewedPostNumbers || []);
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
    await savePendingScorecardPhoto(rec);
    rememberPending(rec);
    setSelected(null);
    setGrid([]);
    setAck(false);
    setScoreChoice("use_scorecard");
    setCrop(fullImageCrop);
    setStage("");
    setElapsed(0);
    // Wait for the user to confirm full image or crop before analysis.
  }
  async function prepareAndAnalyze(nextCrop = crop, rec = pending) {
    if (!rec || rec.status === "analyzing") return;
    setError("");
    setSelected(null);
    setGrid([]);
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
        acknowledgeAmbiguousExisting: false,
        preparationState: "ready",
        status: navigator.onLine ? "saved_on_device" : "waiting_for_connection",
        lastError: null,
      };
      await savePendingScorecardPhoto(next);
      rememberPending(next);
      setCrop(c);
      await analyze(next);
    } catch (e: any) {
      setStage("");
      setError(
        e?.message || "Could not prepare the crop. Try another crop or photo.",
      );
    }
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
      acknowledgeAmbiguousExisting: false,
      preparationState: "ready" as const,
    };
    rememberPending(analyzing);
    setSelected(null);
    setGrid([]);
    await savePendingScorecardPhoto(analyzing);
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
      await savePendingScorecardPhoto(ready);
      rememberPending(ready);
      setSelected(auto);
      setGrid(auto ? analysis.shooterRows[0].grid : []);
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
      await savePendingScorecardPhoto(failed);
      rememberPending(failed);
      setError(failed.lastError || "");
      setStage("");
    }
  }
  function selectShooter(cid: string) {
    const row = pending?.analysis?.shooterRows.find(
      (r) => r.candidateId === cid,
    );
    if (!row || !pending) return;
    const next = {
      ...pending,
      selectedShooterCandidateId: cid,
      reviewedGridFingerprint:
        pending.cropFingerprint || pending.imageFingerprint,
    };
    void savePendingScorecardPhoto({ ...next, reviewedGrid: row.grid });
    rememberPending({ ...next, reviewedGrid: row.grid });
    setSelected(cid);
    setGrid(row.grid);
  }
  function persistReview(
    nextGrid: ScorecardCell[],
    extra: Partial<PendingScorecardPhoto> = {},
  ) {
    setGrid(nextGrid);
    if (pendingRef.current) {
      const next = {
        ...pendingRef.current,
        reviewedGrid: nextGrid,
        selectedShooterCandidateId: selected,
        scoreChoice,
        acknowledgeAmbiguousExisting: ack,
        currentReviewPost: currentPost,
        reviewedPostNumbers: reviewedPosts,
        ...extra,
        reviewedGridFingerprint: pendingRef.current
          ? pendingRef.current.cropFingerprint ||
            pendingRef.current.imageFingerprint
          : null,
      };
      rememberPending(next);
      void savePendingScorecardPhoto(next);
    }
  }
  function setCell(c: ScorecardCell, result: ScorecardOutcome) {
    persistReview(
      applyUserCorrection(grid, c.postNumber, c.targetNumber, result),
    );
  }
  function savePostAndNext() {
    const nextReviewed = Array.from(new Set([...reviewedPosts, currentPost])).sort((a, b) => a - b);
    setReviewedPosts(nextReviewed);
    const unresolved = Array.from({ length: postCount }, (_, i) => i + 1).find((p) => !nextReviewed.includes(p) || grid.some((c) => c.postNumber === p && c.result === "unknown"));
    const nextPost = unresolved || Math.min(postCount, currentPost + 1);
    setCurrentPost(nextPost);
    persistReview(grid, { currentReviewPost: nextPost, reviewedPostNumbers: nextReviewed });
  }
  function navigatePost(post: number) {
    const safe = Math.max(1, Math.min(postCount || 1, post));
    setCurrentPost(safe);
    persistReview(grid, { currentReviewPost: safe, reviewedPostNumbers: reviewedPosts });
  }
  async function apply() {
    if (
      !pending ||
      !selected ||
      summary.unknowns > 0 ||
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
    rememberPending(applying);
    await savePendingScorecardPhoto(applying);
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
      await deletePendingScorecardPhoto(id);
      rememberPending(null);
      const result = json.result || {};
      const qs = new URLSearchParams({
        score: String(result.score ?? summary.score),
        inserted: String(result.insertedMisses ?? 0),
        skipped: String(result.skippedDuplicates ?? 0),
        alreadyImported: String(Boolean(result.alreadyImported)),
        ownScoreUpdated: String(Boolean(result.ownScoreUpdated)),
      });
      router.push(`/sessions/${id}/analysis?scorecardImported=1&${qs.toString()}`);
    } catch (e: any) {
      const retryable = {
        ...applying,
        status: "ready_for_review" as const,
        lastError: e.message || "Apply failed",
      };
      await savePendingScorecardPhoto(retryable);
      rememberPending(retryable);
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
      rememberPending(next);
      void savePendingScorecardPhoto(next);
    }
  }
  async function discard() {
    if (confirm("Discard this local scorecard photo and review?")) {
      await deletePendingScorecardPhoto(id);
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
                className="button"
                onClick={() => camera.current?.click()}
              >
                Take photo
              </button>
              <button
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
                  className="button secondary smallButton"
                  onClick={() => setupBlocksReview ? analyze(pending) : prepareAndAnalyze(crop)}
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
                  className="button"
                  onClick={() => prepareAndAnalyze(fullImageCrop)}
                >
                  Use full image
                </button>
                <button
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
                  className="button secondary"
                  onClick={() => prepareAndAnalyze(crop)}
                >
                  Use this crop
                </button>
              </div>
              <CropOverlay
                imageUrl={previewUrl}
                crop={crop}
                onChange={setCrop}
              />
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
                <button className="button" onClick={() => analyze(pending)} disabled={pending.status === "analyzing"}>
                  Analyze saved image again
                </button>
              </div>
            </div>
          )}
          {pending?.analysis && !setupBlocksReview && (
            <div className="card">
              <h3>Shooter row</h3>
              {pending.analysis.shooterRows.map((r) => (
                <button
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
                  className="secondary smallButton"
                  onClick={() => setViewer("analyzed")}
                >
                  View photo
                </button>
                {!isFullImageCrop(pending?.crop) && (
                  <button
                    className="secondary smallButton"
                    onClick={() => setViewer("original")}
                  >
                    View original photo
                  </button>
                )}
              </div>
              {viewer && previewUrl && (
                <div className="imageLightbox" role="dialog" aria-modal="true">
                  <button className="button" onClick={() => setViewer(null)}>
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
                Saved on this device · Score {summary.score}/{summary.totalTargets} · Unknown {summary.unknowns}
              </p>
              <div className="postNavigator" aria-label="Scorecard post navigator">
                {Array.from({ length: postCount }, (_, pi) => {
                  const post = pi + 1;
                  const postCells = grid.filter((c) => c.postNumber === post);
                  const postSummary = summarizeGrid(postCells);
                  const postMeta = pending?.analysis?.shooterRows.find((r) => r.candidateId === selected)?.posts.find((x) => x.postNumber === post);
                  const status = postMeta?.reconciliationStatus === "conflict" ? "Conflict" : reviewedPosts.includes(post) ? "Reviewed" : postSummary.unknowns ? "Needs review" : "Ready";
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
                return <div className="subcard currentScorecardPost">
                  <h4>{profile?.reviewLabel || "Post"} {currentPost}</h4>
                  <p className="small">Detected post score: <strong>{detectedPostScore ?? "not read"}</strong> · Current reviewed score: <strong>{postSummary.score}/{postCells.length}</strong></p>
                  {detectedPostScore !== null && detectedPostScore !== postSummary.score && <div className="warning small">Detected post score and reviewed score differ. Review this post before applying.</div>}
                  {postMeta?.reconciliationWarning && <div className="warning small">{postMeta.reconciliationWarning}</div>}
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
                <p>Total score {summary.score}/{summary.totalTargets} · Hits {summary.hits} · Misses {summary.misses} · Unknown {summary.unknowns}</p>
                <div className="compactSummary">
                  {Array.from({ length: postCount }, (_, pi) => { const post = pi + 1; const ps = summarizeGrid(grid.filter((c) => c.postNumber === post)); return <button type="button" className="postSummaryButton" key={post} onClick={() => navigatePost(post)}>{profile?.reviewLabel || "Post"} {post}: {ps.score}/{ps.totalTargets}</button>; })}
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
                      };
                      rememberPending(next);
                      void savePendingScorecardPhoto(next);
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
                          };
                          rememberPending(next);
                          void savePendingScorecardPhoto(next);
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
              <div className="stickyApplyBar">
                <button
                  className="button"
                  disabled={
                    !selected ||
                    summary.unknowns > 0 ||
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
    mode: "move" | "nw" | "ne" | "sw" | "se";
  } | null>(null);
  function point(event: React.PointerEvent) {
    const rect = boxRef.current?.getBoundingClientRect();
    return rect
      ? { x: event.clientX / rect.width, y: event.clientY / rect.height }
      : { x: 0, y: 0 };
  }
  function start(
    event: React.PointerEvent,
    mode: "move" | "nw" | "ne" | "sw" | "se",
  ) {
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const p = point(event);
    dragRef.current = { startX: p.x, startY: p.y, crop: clampCrop(crop), mode };
  }
  function move(event: React.PointerEvent) {
    if (!dragRef.current) return;
    const p = point(event),
      d = dragRef.current;
    const dx = p.x - d.startX,
      dy = p.y - d.startY;
    onChange(
      d.mode === "move"
        ? moveCrop(d.crop, dx, dy)
        : resizeCrop(d.crop, d.mode, dx, dy),
    );
  }
  function stop(event: React.PointerEvent) {
    dragRef.current = null;
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(
        event.pointerId,
      );
    } catch {}
  }
  return (
    <div className="cropSurface" ref={boxRef}>
      <img src={imageUrl} alt="Scorecard crop preview" draggable={false} />
      <div className="cropShade" />
      <div
        className="cropFrame"
        style={cropToPercent(crop)}
        onPointerDown={(e) => start(e, "move")}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerCancel={stop}
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
            onPointerMove={move}
            onPointerUp={stop}
            onPointerCancel={stop}
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
