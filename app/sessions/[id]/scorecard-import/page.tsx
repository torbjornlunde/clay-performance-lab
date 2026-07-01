"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import {
  isPostBasedSportingDiscipline,
  postTargetUnitLabel,
} from "@/lib/disciplines";
import {
  applyUserCorrection,
  bulkResolveUnknowns,
  summarizeGrid,
  type NormalizedScorecardAnalysis,
  type ScorecardCell,
  type ScorecardOutcome,
} from "@/lib/scorecards/scorecardAnalysis";
import {
  deletePendingScorecardPhoto,
  getPendingScorecardPhoto,
  savePendingScorecardPhoto,
  shouldIgnoreStale,
  type PendingScorecardPhoto,
} from "@/lib/scorecards/scorecardPhotos";
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
  const active = useRef<any>(null);
  const mounted = useRef(true);
  const [session, setSession] = useState<any>(null);
  const [pending, setPending] = useState<PendingScorecardPhoto | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [grid, setGrid] = useState<ScorecardCell[]>([]);
  const [error, setError] = useState("");
  const [ack, setAck] = useState(false);
  const [scoreChoice, setScoreChoice] = useState<
    "use_scorecard" | "keep_existing"
  >("use_scorecard");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
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
      if (latest?.status === "waiting_for_connection") void analyze(latest);
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
      return;
    }
    const url = URL.createObjectURL(pending.image);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
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
    const p = await getPendingScorecardPhoto(id);
    if (p) {
      rememberPending(p);
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
      if (p.status === "waiting_for_connection" && navigator.onLine)
        void analyze(p);
    }
  }
  const postCount = Number(session?.post_count || session?.course_count),
    tpp = Number(session?.targets_per_post),
    total = postCount * tpp,
    setupOk =
      Number.isInteger(postCount) &&
      postCount > 0 &&
      Number.isInteger(tpp) &&
      tpp > 0 &&
      total <= 500;
  const unsupported =
    session && !isPostBasedSportingDiscipline(session.discipline);
  const conflict =
    session?.total_targets != null &&
    setupOk &&
    session.total_targets !== total;
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
      schemaVersion: 3,
      queueId: clientImportId,
      clientImportId,
      sessionId: id,
      image: blob,
      mimeType: blob.type,
      imageFingerprint,
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
    if (navigator.onLine) void analyze(rec);
  }
  async function analyze(rec = pending) {
    if (!rec) return;
    const op = {
      sessionId: id,
      clientImportId: rec.clientImportId,
      imageFingerprint: rec.imageFingerprint,
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
    };
    rememberPending(analyzing);
    await savePendingScorecardPhoto(analyzing);
    if (!navigator.onLine) return;
    try {
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
      });
      const json = await r.json();
      if (
        !mounted.current ||
        shouldIgnoreStale(active.current, op) ||
        pendingRef.current?.clientImportId !== rec.clientImportId ||
        pendingRef.current?.imageFingerprint !== rec.imageFingerprint
      )
        return;
      if (!r.ok) throw new Error(json.error?.message || "Analysis failed.");
      const analysis = json.result as NormalizedScorecardAnalysis;
      const auto =
        analysis.shooterRows.length === 1 &&
        analysis.shooterRows[0].confidence !== "low"
          ? analysis.shooterRows[0].candidateId
          : null;
      const ready = {
        ...rec,
        status: "ready_for_review" as const,
        analysis,
        selectedShooterCandidateId: auto,
        updatedAt: new Date().toISOString(),
      };
      await savePendingScorecardPhoto(ready);
      rememberPending(ready);
      setSelected(auto);
      setGrid(auto ? analysis.shooterRows[0].grid : []);
    } catch (e: any) {
      const failed = {
        ...rec,
        status: "analysis_failed" as const,
        lastError: e.message || "Analysis failed",
        updatedAt: new Date().toISOString(),
      };
      if (
        !mounted.current ||
        shouldIgnoreStale(active.current, op) ||
        pendingRef.current?.clientImportId !== rec.clientImportId ||
        pendingRef.current?.imageFingerprint !== rec.imageFingerprint
      )
        return;
      await savePendingScorecardPhoto(failed);
      rememberPending(failed);
      setError(failed.lastError || "");
    }
  }
  function selectShooter(cid: string) {
    const row = pending?.analysis?.shooterRows.find(
      (r) => r.candidateId === cid,
    );
    if (!row || !pending) return;
    const next = { ...pending, selectedShooterCandidateId: cid };
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
        ...extra,
        reviewedGrid: nextGrid,
        selectedShooterCandidateId: selected,
        scoreChoice,
        acknowledgeAmbiguousExisting: ack,
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
  async function apply() {
    if (!pending || !selected || summary.unknowns > 0) return;
    const {
      data: { session: auth },
    } = await supabase.auth.getSession();
    const applying = {
      ...pending,
      status: "applying" as const,
      reviewedGrid: grid,
      scoreChoice,
      acknowledgeAmbiguousExisting: ack,
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
      router.push(`/sessions/${id}?scorecardImported=1&${qs.toString()}`);
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
  async function discard() {
    if (confirm("Discard this local scorecard photo and review?")) {
      await deletePendingScorecardPhoto(id);
      rememberPending(null);
      setGrid([]);
      setSelected(null);
      setPreviewUrl(null);
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
          {setupOk ? `${postCount} × ${tpp} targets` : "Post setup required"}
        </p>
        <Link className="button secondary smallButton" href={`/sessions/${id}`}>
          Back to competition
        </Link>
      </div>
      {unsupported && (
        <div className="card error">
          Scorecard photo import is not available for this discipline. Compak,
          Sporttrap and rotation-based formats are out of scope for v1.
        </div>
      )}
      {!unsupported && !setupOk && (
        <div className="card">
          <p>
            Set up the number of posts and targets per post before importing a
            scorecard.
          </p>
          <Link className="button" href={`/sessions/${id}/targets`}>
            Open post setup
          </Link>
        </div>
      )}
      {conflict && (
        <div className="card error">
          Saved total targets conflicts with {postCount} × {tpp}. Review post
          setup before applying.{" "}
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
              <p className="small muted">
                Status:{" "}
                {pending.status === "waiting_for_connection"
                  ? "Saved on this device — analysis needs connection"
                  : pending.status}
              </p>
            )}
            <div className="btns">
              {pending && (
                <button
                  className="button secondary smallButton"
                  onClick={() => analyze()}
                >
                  {pending.status === "analysis_failed"
                    ? "Retry analysis"
                    : "Analyze"}
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
              <h3>Image preview</h3>
              <img
                alt="Selected scorecard"
                style={{ maxWidth: "100%", borderRadius: 12 }}
                src={previewUrl}
              />
            </div>
          )}
          {pending?.analysis && (
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
          {grid.length > 0 && (
            <div className="card">
              <h3>Review grid</h3>
              <p>
                Score {summary.score}/{summary.totalTargets} · Hits{" "}
                {summary.hits} · Misses {summary.misses} · Unknown{" "}
                {summary.unknowns}
              </p>
              <div className="btns">
                <button
                  className="button secondary smallButton"
                  onClick={() =>
                    persistReview(
                      bulkResolveUnknowns(
                        grid,
                        "hit",
                        confirm("Mark all unknown targets as hit?"),
                      ).grid,
                    )
                  }
                >
                  Mark all unknown as hit
                </button>
                <button
                  className="button secondary smallButton"
                  onClick={() =>
                    persistReview(
                      bulkResolveUnknowns(
                        grid,
                        "miss",
                        confirm("Mark all unknown targets as miss?"),
                      ).grid,
                    )
                  }
                >
                  Mark all unknown as miss
                </button>
              </div>
              {Array.from({ length: postCount }, (_, pi) => (
                <div className="subcard" key={pi}>
                  <h4>
                    {postTargetUnitLabel(session.discipline)} {pi + 1}
                  </h4>
                  <div className="scorecardGrid">
                    {grid
                      .filter((c) => c.postNumber === pi + 1)
                      .map((c) => (
                        <button
                          key={`${c.postNumber}-${c.targetNumber}`}
                          className={`scorecardCell ${c.result}`}
                          onClick={() =>
                            setCell(
                              c,
                              c.result === "hit"
                                ? "miss"
                                : c.result === "miss"
                                  ? "unknown"
                                  : "hit",
                            )
                          }
                        >
                          <strong>{c.targetNumber}</strong>
                          <span>{c.result}</span>
                          {c.confidence !== "high" && (
                            <small>{c.confidence}</small>
                          )}
                        </button>
                      ))}
                  </div>
                </div>
              ))}
              {pending?.analysis?.warnings?.map((w) => (
                <p className="small muted" key={w}>
                  {w}
                </p>
              ))}
              <details>
                <summary>Raw detected text</summary>
                <p className="small">
                  {pending?.analysis?.rawText || "No raw text."}
                </p>
              </details>
              {summary.unknowns > 0 && (
                <div className="error">
                  Resolve every unknown target before applying.
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
                />{" "}
                I understand ambiguous existing misses will be preserved.
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
                    conflict
                  }
                  onClick={apply}
                >
                  {pending?.status === "applying"
                    ? "Applying..."
                    : "Confirm import"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
