"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { appBuildLabel } from "@/lib/appBuildInfo";
import { supabase } from "@/lib/supabase/client";
import { TRAINING_SCORE_SHEET_QUICK_START_STEPS } from "@/lib/trainingScoreSheets/feedback";
import { userFacingDeleteError, userFacingLoadError } from "@/lib/userFacingErrors";
import { ContextualHelpCard } from "@/app/components/OnboardingHelp";

type ScoreSheetRow = {
  id: string;
  owner_user_id: string;
  title: string;
  session_date: string;
  location: string | null;
  discipline: string;
  session_type: string;
  number_of_posts: number;
  targets_per_post: number;
  total_targets: number;
  created_at: string;
  updated_at: string | null;
};

type CountRow = {
  score_sheet_id: string;
};

type LocalDraft = {
  version: 1;
  sheetId: string;
  scoreSheetId: string | null;
  localDraftId: string;
  updatedAt: string;
  synced: boolean;
  dirty: boolean;
  title: string;
  sessionDate: string;
  location: string;
  discipline: string;
  sessionType: string;
  numberOfPosts: number;
  targetsPerPost: number;
  shooters: Array<{ localId: string; name: string; scores: number[] }>;
  targetResults: Record<string, Record<string, Record<string, "hit" | "miss">>>;
};

type SheetListItem = {
  id: string;
  ownerUserId: string | null;
  serverId: string | null;
  localDraftKey: string | null;
  localDraftId: string | null;
  title: string;
  sessionDate: string;
  location: string | null;
  discipline: string;
  sessionType: string;
  shooterCount: number;
  scoreCount: number;
  targetResultCount: number;
  totalTargets: number;
  numberOfPosts: number;
  targetsPerPost: number;
  createdAt: string | null;
  updatedAt: string | null;
  syncStatus: "Synced" | "Unsynced local draft" | "Local draft";
  hasUnsyncedLocalDraft: boolean;
  isLocalOnly: boolean;
};

type Filter = "all" | "drafts" | "completed" | "unsynced";

const LOCAL_DRAFT_PREFIX = "training_score_sheet_draft:";
const LEGACY_LOCAL_DRAFT_PREFIX = "training-score-sheet:";
const DELETE_CONFIRMATION =
  "Delete this training score sheet? This will remove shooters, scores, and target results. This cannot be undone.";

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function sessionTypeLabel(value: string) {
  return value === "shared_training" ? "Shared training" : "Training";
}

function localDraftKey(sheetId: string) {
  return `${LOCAL_DRAFT_PREFIX}${sheetId}`;
}

function legacyLocalDraftKey(sheetId: string) {
  return `${LEGACY_LOCAL_DRAFT_PREFIX}${sheetId}:autosave`;
}

function parseLocalDraft(rawDraft: string | null) {
  if (!rawDraft) return null;
  try {
    const draft = JSON.parse(rawDraft) as Partial<LocalDraft>;
    if (draft.version !== 1 || !draft.sheetId || !draft.updatedAt) return null;
    return {
      ...draft,
      scoreSheetId: draft.scoreSheetId || (draft.sheetId.startsWith("new:") ? null : draft.sheetId),
      localDraftId: draft.localDraftId || draft.sheetId,
      synced: Boolean(draft.synced),
      dirty: draft.dirty ?? !draft.synced,
      title: draft.title || "Untitled training score sheet",
      sessionDate: draft.sessionDate || new Date().toISOString().slice(0, 10),
      location: draft.location || "",
      discipline: draft.discipline || "Training",
      sessionType: draft.sessionType || "training",
      numberOfPosts: draft.numberOfPosts || 0,
      targetsPerPost: draft.targetsPerPost || 0,
      shooters: draft.shooters || [],
      targetResults: draft.targetResults || {},
    } as LocalDraft;
  } catch {
    return null;
  }
}

function countBySheet(rows: CountRow[]) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.score_sheet_id] = (acc[row.score_sheet_id] || 0) + 1;
    return acc;
  }, {});
}

function countDraftTargetResults(draft: LocalDraft) {
  return Object.values(draft.targetResults || {}).reduce(
    (total, posts) =>
      total +
      Object.values(posts || {}).reduce(
        (postTotal, targets) => postTotal + Object.keys(targets || {}).length,
        0,
      ),
    0,
  );
}

function getLocalDrafts() {
  if (typeof window === "undefined") return [];
  return Object.keys(window.localStorage)
    .filter((key) => key.startsWith(LOCAL_DRAFT_PREFIX))
    .flatMap((key) => {
      const draft = parseLocalDraft(window.localStorage.getItem(key));
      return draft ? [{ key, draft }] : [];
    });
}

function statusBadges(item: SheetListItem) {
  const badges: string[] = [];
  if (item.hasUnsyncedLocalDraft) badges.push("Unsynced local draft");
  if (item.isLocalOnly) badges.push("Local draft");
  if (item.shooterCount === 0) badges.push("No shooters");
  if (item.scoreCount === 0 && item.targetResultCount === 0) badges.push("No scores");
  if (item.shooterCount === 0 || item.scoreCount === 0 || item.targetResultCount === 0 || item.hasUnsyncedLocalDraft) {
    badges.push("Draft");
  }
  if (item.shooterCount > 0 && item.targetResultCount > 0 && item.targetResultCount < item.shooterCount * item.totalTargets) {
    badges.push("Incomplete");
  }
  return Array.from(new Set(badges));
}

function isCompleted(item: SheetListItem) {
  return item.shooterCount > 0 && item.targetResultCount >= item.shooterCount * item.totalTargets && !item.hasUnsyncedLocalDraft;
}

function isDraftOrIncomplete(item: SheetListItem) {
  return !isCompleted(item) || statusBadges(item).some((badge) => ["No shooters", "No scores", "Draft", "Incomplete"].includes(badge));
}

function progressSummary(item: SheetListItem) {
  const expectedTargetResults = item.shooterCount * item.totalTargets;
  const shooterLabel = item.shooterCount === 1 ? "shooter" : "shooters";
  const targetsLabel = item.totalTargets === 1 ? "target" : "targets";
  const setupLine =
    item.shooterCount > 0 && item.totalTargets > 0
      ? `${item.shooterCount} ${shooterLabel} · ${item.totalTargets} ${targetsLabel} each`
      : item.shooterCount > 0
        ? `${item.shooterCount} ${shooterLabel} · target total not set`
        : item.totalTargets > 0
          ? `No shooters · ${item.totalTargets} ${targetsLabel} each`
          : "No shooters · target total not set";

  const resultsLabel = item.targetResultCount === 1 ? "target result" : "target results";
  const resultLine =
    expectedTargetResults > 0
      ? `${item.targetResultCount} of ${expectedTargetResults} target results logged`
      : `${item.targetResultCount} ${resultsLabel} logged`;

  return [setupLine, resultLine];
}

function workflowStatus(item: SheetListItem) {
  if (isCompleted(item)) return "Completed";
  if (statusBadges(item).includes("Incomplete")) return "Incomplete";
  return "Draft";
}

function secondaryStatusBadges(item: SheetListItem) {
  const primaryStatuses = new Set([item.syncStatus, workflowStatus(item), "Unsynced local draft", "Local draft"]);
  return statusBadges(item).filter((badge) => !primaryStatuses.has(badge));
}

function sortNewestFirst(a: SheetListItem, b: SheetListItem) {
  const aTime = new Date(a.updatedAt || a.createdAt || a.sessionDate).getTime();
  const bTime = new Date(b.updatedAt || b.createdAt || b.sessionDate).getTime();
  return bTime - aTime;
}

export default function TrainingScoreSheetsPage() {
  const router = useRouter();
  const [items, setItems] = useState<SheetListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    setErr("");
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) {
      setErr(userFacingLoadError(userError));
      setLoading(false);
      return;
    }
    if (!userData.user) {
      router.push("/login");
      return;
    }
    setCurrentUserId(userData.user.id);

    const { data: sheets, error: sheetError } = await supabase
      .from("training_score_sheets")
      .select(
        "id,owner_user_id,title,session_date,location,discipline,session_type,number_of_posts,targets_per_post,total_targets,created_at,updated_at",
      )
      .order("session_date", { ascending: false })
      .order("updated_at", { ascending: false })
      .returns<ScoreSheetRow[]>();

    if (sheetError) {
      setErr(userFacingLoadError(sheetError, "Could not load training score sheets right now. Check your connection and try again."));
      setLoading(false);
      return;
    }

    const sheetIds = (sheets || []).map((sheet) => sheet.id);
    let shooterCounts: Record<string, number> = {};
    let scoreCounts: Record<string, number> = {};
    let targetCounts: Record<string, number> = {};

    if (sheetIds.length > 0) {
      const [shootersResult, scoresResult, targetsResult] = await Promise.all([
        supabase.from("training_score_sheet_shooters").select("score_sheet_id").in("score_sheet_id", sheetIds).returns<CountRow[]>(),
        supabase.from("training_score_sheet_scores").select("score_sheet_id").in("score_sheet_id", sheetIds).returns<CountRow[]>(),
        supabase.from("training_score_sheet_target_results").select("score_sheet_id").in("score_sheet_id", sheetIds).returns<CountRow[]>(),
      ]);

      if (shootersResult.error || scoresResult.error || targetsResult.error) {
        setErr(userFacingLoadError(shootersResult.error || scoresResult.error || targetsResult.error, "Could not load score sheet details right now. Check your connection and try again."));
        setLoading(false);
        return;
      }

      shooterCounts = countBySheet(shootersResult.data || []);
      scoreCounts = countBySheet(scoresResult.data || []);
      targetCounts = countBySheet(targetsResult.data || []);
    }

    const localDrafts = getLocalDrafts();
    const draftsByServerId = new Map<string, { key: string; draft: LocalDraft }>();
    localDrafts.forEach((entry) => {
      if (entry.draft.scoreSheetId && !entry.draft.synced) {
        draftsByServerId.set(entry.draft.scoreSheetId, entry);
      }
    });

    const serverItems: SheetListItem[] = (sheets || []).map((sheet) => {
      const draft = draftsByServerId.get(sheet.id);
      return {
        id: sheet.id,
        ownerUserId: sheet.owner_user_id,
        serverId: sheet.id,
        localDraftKey: draft?.key || null,
        localDraftId: draft?.draft.localDraftId || null,
        title: draft?.draft.title || sheet.title,
        sessionDate: draft?.draft.sessionDate || sheet.session_date,
        location: draft?.draft.location || sheet.location,
        discipline: draft?.draft.discipline || sheet.discipline,
        sessionType: draft?.draft.sessionType || sheet.session_type,
        shooterCount: draft?.draft.shooters.length ?? shooterCounts[sheet.id] ?? 0,
        scoreCount: scoreCounts[sheet.id] || 0,
        targetResultCount: draft ? countDraftTargetResults(draft.draft) : targetCounts[sheet.id] || 0,
        totalTargets: draft ? draft.draft.numberOfPosts * draft.draft.targetsPerPost : sheet.total_targets,
        numberOfPosts: draft?.draft.numberOfPosts || sheet.number_of_posts,
        targetsPerPost: draft?.draft.targetsPerPost || sheet.targets_per_post,
        createdAt: sheet.created_at,
        updatedAt: draft?.draft.updatedAt || sheet.updated_at || sheet.created_at,
        syncStatus: draft ? "Unsynced local draft" : "Synced",
        hasUnsyncedLocalDraft: Boolean(draft),
        isLocalOnly: false,
      };
    });

    const localOnlyItems: SheetListItem[] = localDrafts
      .filter((entry) => !entry.draft.synced && !entry.draft.scoreSheetId)
      .map(({ key, draft }) => ({
        id: draft.sheetId,
        ownerUserId: null,
        serverId: null,
        localDraftKey: key,
        localDraftId: draft.localDraftId,
        title: draft.title,
        sessionDate: draft.sessionDate,
        location: draft.location || null,
        discipline: draft.discipline,
        sessionType: draft.sessionType,
        shooterCount: draft.shooters.length,
        scoreCount: 0,
        targetResultCount: countDraftTargetResults(draft),
        totalTargets: draft.numberOfPosts * draft.targetsPerPost,
        numberOfPosts: draft.numberOfPosts,
        targetsPerPost: draft.targetsPerPost,
        createdAt: null,
        updatedAt: draft.updatedAt,
        syncStatus: "Local draft",
        hasUnsyncedLocalDraft: true,
        isLocalOnly: true,
      }));

    setItems([...serverItems, ...localOnlyItems].sort(sortNewestFirst));
    setLoading(false);
  }

  function openItem(item: SheetListItem) {
    if (item.serverId) {
      router.push(`/training-score-sheets/${item.serverId}`);
      return;
    }
    if (item.localDraftId && typeof window !== "undefined") {
      window.localStorage.setItem("training_score_sheet_new_local_draft_id", item.localDraftId.replace(/^new:/, ""));
    }
    router.push("/training-score-sheets/new");
  }

  async function deleteItem(item: SheetListItem) {
    if (item.isLocalOnly) {
      const confirmed = window.confirm(
        "Delete this unsynced local draft? This will remove the local shooters, scores, and target results. This cannot be undone.",
      );
      if (!confirmed) return;
      if (item.localDraftKey) window.localStorage.removeItem(item.localDraftKey);
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      setMessage("Local draft deleted.");
      return;
    }

    if (!item.serverId || !currentUserId) return;
    const confirmed = window.confirm(DELETE_CONFIRMATION);
    if (!confirmed) return;

    setDeletingId(item.id);
    setErr("");
    setMessage("");

    const { data: deletedSheet, error: deleteError } = await supabase
      .from("training_score_sheets")
      .delete()
      .eq("id", item.serverId)
      .eq("owner_user_id", currentUserId)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (deleteError || !deletedSheet) {
      setErr(userFacingDeleteError(deleteError, "Could not delete this training score sheet right now. Try again when online."));
      setDeletingId(null);
      return;
    }

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(localDraftKey(item.serverId));
      window.localStorage.removeItem(legacyLocalDraftKey(item.serverId));
      if (item.localDraftKey) window.localStorage.removeItem(item.localDraftKey);
    }

    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    setMessage("Training score sheet deleted.");
    setDeletingId(null);
  }

  const visibleItems = useMemo(() => {
    if (filter === "drafts") return items.filter(isDraftOrIncomplete);
    if (filter === "completed") return items.filter(isCompleted);
    if (filter === "unsynced") return items.filter((item) => item.hasUnsyncedLocalDraft);
    return items;
  }, [filter, items]);

  const filterCounts = useMemo(
    () => ({
      all: items.length,
      drafts: items.filter(isDraftOrIncomplete).length,
      completed: items.filter(isCompleted).length,
      unsynced: items.filter((item) => item.hasUnsyncedLocalDraft).length,
    }),
    [items],
  );

  return (
    <main className="container narrow">
      <div className="card">
        <div className="heroTopline">
          <div>
            <p className="eyebrow">Training Score Sheets</p>
            <h1>Score sheet archive</h1>
            <p className="muted">
              Review, reopen, and manage your training score sheets.
            </p>
            <ContextualHelpCard storageKey="training-score-sheet">Use this when one person records scores for several shooters during training.</ContextualHelpCard>
          </div>
          <div className="btns heroActions">
            <Link href="/dashboard" className="button secondary smallButton">Dashboard</Link>
            <Link href="/training-score-sheets/new" className="button smallButton">New training score sheet</Link>
          </div>
        </div>

        <section className="subcard scoreSheetStructurePanel" aria-label="Training score sheet actions">
          <div>
            <p className="eyebrow">Score sheets</p>
            <h2>Create or continue a score sheet</h2>
            <p className="small muted">Choose discipline and setup inside the new score sheet flow.</p>
          </div>
          <div className="quickStartPresetActions">
            <Link href="/training-score-sheets/new" className="button primaryAction">New training score sheet</Link>
            <Link href="/import/scorecard" className="button secondary smallButton">Import scorecard photo</Link>
            <a href="#existing-score-sheets" className="button secondary smallButton">Existing score sheets</a>
            <button type="button" className="button secondary smallButton" onClick={() => setFilter("drafts")}>Drafts / incomplete</button>
          </div>
        </section>

        <details className="subcard quickStartCard">
          <summary>
            <span>Quick start</span>
            <span className="small muted">Workflow</span>
          </summary>
          <ol className="quickStartList">
            {TRAINING_SCORE_SHEET_QUICK_START_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </details>

        {err && <p className="error">{err}</p>}
        {message && <p className="success">{message}</p>}

        <div id="existing-score-sheets" className="filterBar" aria-label="Training score sheet filters">
          {([
            ["all", "All"],
            ["drafts", "Drafts / incomplete"],
            ["completed", "Completed"],
            ["unsynced", "Unsynced"],
          ] as Array<[Filter, string]>).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`secondary smallButton filterButton ${filter === value ? "activeFilter" : ""}`}
              onClick={() => setFilter(value)}
            >
              {label} <span className="countPill">{filterCounts[value]}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <p>Loading training score sheets...</p>
        ) : visibleItems.length === 0 ? (
          <div className="emptyState">
            <p>
              {items.length === 0
                ? "No training score sheets yet. Create one to start tracking a multi-shooter training round."
                : "No training score sheets match this filter."}
            </p>
          </div>
        ) : (
          <div className="scoreSheetArchiveList">
            {visibleItems.map((item) => {
              const canDelete = item.isLocalOnly || item.ownerUserId === currentUserId;
              const primaryWorkflowStatus = workflowStatus(item);
              const secondaryBadges = secondaryStatusBadges(item);
              const progressLines = progressSummary(item);
              return (
                <article key={item.id} className="sessionItem trainingScoreSheetArchiveItem">
                  <div className="sessionContent">
                    <div className="archiveCardHeader">
                      <strong>{item.title}</strong>
                      <div className="sheetStatusBadges primaryStatusBadges" aria-label="Score sheet status">
                        <span className={item.hasUnsyncedLocalDraft ? "badge badgeGold" : "badge badgeGreen"}>
                          {item.syncStatus}
                        </span>
                        <span className="badge badgeBlue">{primaryWorkflowStatus}</span>
                      </div>
                    </div>
                    <div className="small muted sessionMeta compactMeta archivePrimaryMeta">
                      <span>{formatDate(item.sessionDate)}</span>
                      {item.location && <span>{item.location}</span>}
                      <span>{item.discipline}</span>
                      <span>{sessionTypeLabel(item.sessionType)}</span>
                    </div>
                    <div className="archiveProgressSummary" aria-label="Scoring progress">
                      <span>{progressLines[0]}</span>
                      <span>{progressLines[1]}</span>
                    </div>
                    <details className="archiveDetails">
                      <summary>Details</summary>
                      <div className="resultMetrics scoreSheetMetrics">
                        <span>Setup <strong>{item.numberOfPosts} × {item.targetsPerPost}</strong></span>
                        <span>Score rows <strong>{item.scoreCount}</strong></span>
                        <span>Target results <strong>{item.targetResultCount}</strong></span>
                      </div>
                      <div className="small muted sessionMeta compactMeta">
                        <span>Created {formatDateTime(item.createdAt)}</span>
                        <span>Updated {formatDateTime(item.updatedAt)}</span>
                      </div>
                      {secondaryBadges.length > 0 && (
                        <div className="sheetStatusBadges">
                          {secondaryBadges.map((badge) => (
                            <span key={badge} className="badge badgeBlue">{badge}</span>
                          ))}
                        </div>
                      )}
                    </details>
                  </div>
                  <div className="sessionActions archiveActions">
                    <button type="button" className="button secondary smallButton" onClick={() => openItem(item)}>
                      Open / edit
                    </button>
                    {canDelete && (
                      <details className="compactMoreActions">
                        <summary className="button secondary smallButton">More actions</summary>
                        <button
                          type="button"
                          className="button secondary smallButton danger"
                          onClick={() => void deleteItem(item)}
                          disabled={deletingId === item.id}
                        >
                          {deletingId === item.id ? "Deleting..." : "Delete"}
                        </button>
                      </details>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
        <details className="debugBuildInfo">
          <summary className="small muted">Version / build</summary>
          <p className="small muted">{appBuildLabel()}</p>
        </details>
      </div>
    </main>
  );
}
