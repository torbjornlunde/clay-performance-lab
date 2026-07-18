import { FEATURE_CATALOG, getFeatureDefinition } from "./features";
import type { BillingMode, EntitlementUserContext, FeatureAccessResult, FeatureKey } from "./types";

export const PRO_PREVIEW_COPY = {
  proFeature: "This is a Pro feature.",
  unlockValue: "Unlock advanced performance analysis, coach reports and AI-powered insights.",
  trialUsed: "You have used your free preview for this feature.",
  betaUnavailable: "This feature is not available in the current beta.",
  complianceAccess: "Original data access for account compliance is handled separately from product exports.",
} as const;

export function getBillingMode(env: Pick<NodeJS.ProcessEnv, string> = process.env): BillingMode {
  const raw = env.NEXT_PUBLIC_BILLING_MODE || env.BILLING_MODE || "beta_hidden";
  return raw === "disabled" || raw === "preview_only" || raw === "enabled" || raw === "beta_hidden" ? raw : "beta_hidden";
}

export function isBillingVisible(mode: BillingMode = getBillingMode()) { return mode === "preview_only" || mode === "enabled"; }
function modeFor(context?: EntitlementUserContext) { return context?.billingMode || getBillingMode(); }
function hasInternalAllowance(context?: EntitlementUserContext) { return Boolean(context?.isAdmin || context?.plan === "internal" || context?.plan === "tester"); }
function hasPaidAllowance(context?: EntitlementUserContext) { return hasInternalAllowance(context) || context?.plan === "pro"; }

export function getFeatureLimit(context: EntitlementUserContext | undefined, featureKey: FeatureKey) {
  return context?.featureLimits?.[featureKey] ?? getFeatureDefinition(featureKey).defaultFreeTrialLimit ?? null;
}

export function canUseFeature(context: EntitlementUserContext | undefined, featureKey: FeatureKey): FeatureAccessResult {
  const feature = getFeatureDefinition(featureKey);
  const billingMode = modeFor(context);
  if (feature.tier === "free") return { allowed: true, feature, reason: "free" };
  if (feature.tier === "compliance_access") return { allowed: true, feature, reason: "compliance" };
  if (hasInternalAllowance(context)) return { allowed: true, feature, reason: context?.isAdmin ? "admin" : "internal" };
  if (billingMode === "disabled") return { allowed: true, feature, reason: "billing_disabled" };
  if (billingMode === "beta_hidden") return context?.isApprovedBetaUser ? { allowed: true, feature, reason: "beta" } : { allowed: false, feature, reason: feature.tier === "admin_only" ? "admin_only" : feature.tier === "beta_only" ? "beta_only" : "requires_pro" };
  if (feature.tier === "admin_only") return { allowed: false, feature, reason: "admin_only" };
  if (feature.tier === "beta_only") return context?.isApprovedBetaUser ? { allowed: true, feature, reason: "beta" } : { allowed: false, feature, reason: "beta_only" };
  if (context?.plan === "pro") return { allowed: true, feature, reason: "pro" };
  if ((feature.tier === "pro_trial" || feature.allowTrial) && billingMode === "preview_only") {
    const limit = getFeatureLimit(context, featureKey);
    const used = context?.trialUsage?.[featureKey] ?? 0;
    if (limit == null || used < limit) return { allowed: true, feature, reason: "trial" };
    return { allowed: false, feature, reason: "trial_limit_reached" };
  }
  return { allowed: false, feature, reason: "requires_pro" };
}

export function shouldShowProPreview(context: EntitlementUserContext | undefined, featureKey: FeatureKey) {
  const billingMode = modeFor(context);
  if (!isBillingVisible(billingMode)) return false;
  const access = canUseFeature(context, featureKey);
  return !access.allowed && access.feature.tier !== "free" && access.feature.tier !== "compliance_access";
}

export function shouldBlockPaidCostFeature(context: EntitlementUserContext | undefined, featureKey: FeatureKey) {
  const feature = getFeatureDefinition(featureKey);
  if (!feature.costSensitive) return false;
  if (modeFor(context) !== "enabled") return false;
  return !hasPaidAllowance(context);
}
