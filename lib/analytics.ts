import type { SupabaseClient } from "@supabase/supabase-js";

export const ANALYTICS_EVENTS = [
  "app_page_view",
  "profile_completed",
  "result_created_manual",
  "leirdue_search_started",
  "leirdue_search_completed",
  "leirdue_import_saved",
  "scorecard_photo_uploaded",
  "scorecard_analysis_completed",
  "scorecard_review_applied",
  "training_score_sheet_created",
  "training_score_sheet_saved",
  "target_setup_started",
  "target_setup_saved",
  "session_detail_opened",
  "leirdue_source_refresh_checked",
  "leirdue_source_refresh_applied",
  "private_note_saved",
  "private_note_deleted",
  "private_note_saved_local",
  "private_note_sync_succeeded",
  "private_note_sync_failed",
  "error_reported",
  "onboarding_opened",
  "onboarding_dismissed",
  "contextual_help_dismissed",
  "coach_report_preview_opened",
  "coach_report_copied",
  "coach_report_period_preview_opened",
  "coach_report_period_copied",
  "coach_report_ai_generate_clicked",
  "coach_report_ai_generated",
  "coach_report_ai_failed",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

const ALLOWED_METADATA_KEYS = new Set([
  "action",
  "analysisStatus",
  "candidateCount",
  "completed",
  "count",
  "discipline",
  "duplicateCount",
  "errorCategory",
  "errorCode",
  "feature",
  "flow",
  "hasSourceUrl",
  "hasPostNotes",
  "hasSessionNote",
  "hasNotesContext",
  "hasLeirdueContext",
  "includesPrivateNotes",
  "hasBody",
  "importedCount",
  "mode",
  "pendingAction",
  "periodDays",
  "privateNoteCount",
  "resultCount",
  "reportType",
  "savedCount",
  "scoreChoice",
  "scope",
  "selectedCount",
  "selectedSessionCount",
  "sectionCount",
  "status",
  "success",
  "targetCount",
  "trainingCount",
  "competitionCount",
  "disciplineCount",
  "dataQuality",
  "year",
]);

const SAFE_PRIVATE_NOTE_METADATA_KEYS = new Set(["includesPrivateNotes", "privateNoteCount", "hasSessionNote", "hasPostNotes", "hasNotesContext"]);
const PRIVATE_KEY_PATTERN = /(email|mail|ip|user.?agent|ua|note|comment|name|shooter|image|photo|url|href|link|token|secret|password)/i;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function sanitizeValue(value: unknown): string | number | boolean | null | undefined {
  if (value === null || value === undefined) return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    if (EMAIL_PATTERN.test(value)) return undefined;
    if (/^https?:\/\//i.test(value)) return undefined;
    return value.slice(0, 80);
  }
  return undefined;
}

export function sanitizeAnalyticsMetadata(metadata: Record<string, unknown> | null | undefined) {
  const clean: Record<string, string | number | boolean | null> = {};
  if (!metadata) return clean;
  for (const [key, rawValue] of Object.entries(metadata)) {
    if (!ALLOWED_METADATA_KEYS.has(key) || (!SAFE_PRIVATE_NOTE_METADATA_KEYS.has(key) && PRIVATE_KEY_PATTERN.test(key))) continue;
    const value = sanitizeValue(rawValue);
    if (value !== undefined) clean[key] = value;
  }
  return clean;
}

export function analyticsRoute(input?: string | null) {
  const path = input || (typeof window !== "undefined" ? window.location.pathname : null);
  if (!path) return null;
  return path.split("?")[0].slice(0, 160);
}

function isLocalDevelopment() {
  return typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
}

export async function recordAnalyticsEvent(
  supabase: Pick<SupabaseClient, "auth" | "from">,
  eventName: AnalyticsEventName,
  options: { route?: string | null; feature?: string | null; discipline?: string | null; sessionId?: string | null; metadata?: Record<string, unknown> | null } = {},
) {
  try {
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (!userId) return;
    const { error } = await supabase.from("analytics_events").insert({
      user_id: userId,
      event_name: eventName,
      route: analyticsRoute(options.route),
      feature: options.feature?.slice(0, 80) || null,
      discipline: options.discipline?.slice(0, 80) || null,
      session_id: options.sessionId || null,
      metadata: sanitizeAnalyticsMetadata(options.metadata),
    });
    if (error && isLocalDevelopment()) console.warn("Analytics event was not recorded.", error.message);
  } catch (error) {
    if (isLocalDevelopment()) console.warn("Analytics event was not recorded.", error);
  }
}
