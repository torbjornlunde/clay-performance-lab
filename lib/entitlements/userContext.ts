import { getBillingMode } from "./check";
import type { BillingMode, EntitlementPlan, EntitlementUserContext } from "./types";

type AccessProfileLike = { user_id?: string | null; id?: string | null; access_status?: string | null; system_role?: string | null; plan?: string | null } | null | undefined;
type EntitlementRowLike = { plan?: string | null; status?: string | null; valid_until?: string | null } | null | undefined;

function normalizePlan(value: string | null | undefined): EntitlementPlan {
  return value === "pro" || value === "internal" || value === "tester" ? value : "free";
}

function isActiveEntitlement(row: EntitlementRowLike) {
  if (!row || row.status !== "active") return false;
  return !row.valid_until || new Date(row.valid_until).getTime() > Date.now();
}

export function createEntitlementUserContext(input: { userId?: string | null; accessProfile?: AccessProfileLike; entitlement?: EntitlementRowLike; billingMode?: BillingMode; trialUsage?: EntitlementUserContext["trialUsage"]; featureLimits?: EntitlementUserContext["featureLimits"] } = {}): EntitlementUserContext {
  const access = input.accessProfile;
  const role = access?.system_role;
  const entitlementPlan = isActiveEntitlement(input.entitlement) ? input.entitlement?.plan : null;
  const profilePlan = access?.plan;
  return {
    userId: input.userId || access?.user_id || access?.id || null,
    isApprovedBetaUser: access?.access_status === "approved",
    isAdmin: role === "owner" || role === "admin",
    plan: normalizePlan(entitlementPlan || profilePlan),
    billingMode: input.billingMode || getBillingMode(),
    trialUsage: input.trialUsage,
    featureLimits: input.featureLimits,
  };
}
