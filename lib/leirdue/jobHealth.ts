export const LEIRDUE_RECENT_REFRESH_JOB_NAME = "leirdue_refresh_recent";
export const LEIRDUE_JOB_HEALTH_STALE_HOURS = 36;

export type LeirdueJobStatus = "success" | "partial" | "failed";
export type LeirdueHealthState = "healthy" | "degraded" | "failed" | "stale" | "never_run";

export type LeirdueJobHealthRow = {
  job_name: string;
  started_at: string | null;
  finished_at: string | null;
  status: LeirdueJobStatus;
  refreshed_count: number;
  error_count: number;
  last_success_at: string | null;
  failure_reason: string | null;
  affected_scope: Record<string, unknown> | null;
  updated_at: string | null;
};

export function deriveLeirdueHealthState(row: Pick<LeirdueJobHealthRow, "status" | "last_success_at"> | null | undefined, now = new Date()): LeirdueHealthState {
  if (!row) return "never_run";
  if (row.status === "failed") return "failed";
  if (row.status === "partial") return "degraded";
  if (!row.last_success_at) return "never_run";
  const lastSuccess = new Date(row.last_success_at).getTime();
  if (!Number.isFinite(lastSuccess)) return "stale";
  const staleAfterMs = LEIRDUE_JOB_HEALTH_STALE_HOURS * 60 * 60 * 1000;
  if (now.getTime() - lastSuccess > staleAfterMs) return "stale";
  return "healthy";
}

export function leirdueHealthSummary(state: LeirdueHealthState) {
  switch (state) {
    case "healthy": return "Leirdue refresh healthy";
    case "degraded": return "Leirdue refresh degraded";
    case "failed": return "Leirdue refresh failed";
    case "stale": return "Leirdue refresh stale";
    case "never_run": return "Leirdue refresh has not run yet";
  }
}

export function needsLeirdueAdminAttention(state: LeirdueHealthState) {
  return state !== "healthy";
}

// Phase 3: send owner/admin email when this job becomes failed or stale, repeated parser/fetch failures occur, or the job has never run after the deployment window.
