import type { SupabaseClient } from "@supabase/supabase-js";
import { canUseFeature, shouldBlockPaidCostFeature } from "./check";
import type { EntitlementUserContext, FeatureKey } from "./types";

export class FeatureAccessError extends Error { constructor(public featureKey: FeatureKey, public status = 403, message = "This feature is not available for your account.") { super(message); this.name = "FeatureAccessError"; } }
export function requireFeatureAccess(featureKey: FeatureKey, userContext: EntitlementUserContext) { const result = canUseFeature(userContext, featureKey); if (!result.allowed) throw new FeatureAccessError(featureKey); return result; }
export function requirePaidCostAccess(featureKey: FeatureKey, userContext: EntitlementUserContext) { if (shouldBlockPaidCostFeature(userContext, featureKey)) throw new FeatureAccessError(featureKey, 402, "This AI-powered Pro feature is not available for your account."); return requireFeatureAccess(featureKey, userContext); }
export async function recordFeatureUsage(supabase: SupabaseClient | null | undefined, featureKey: FeatureKey, userId: string, metadata: Record<string, unknown> = {}, eventType = "used") { if (!supabase) return; await supabase.from("feature_usage_events").insert({ user_id: userId, feature_key: featureKey, event_type: eventType, metadata }); }
