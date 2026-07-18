import type { ReactNode } from "react";
import { canUseFeature, shouldShowProPreview } from "@/lib/entitlements/check";
import type { EntitlementUserContext, FeatureKey } from "@/lib/entitlements/types";
import { LockedFeatureCard } from "./LockedFeatureCard";

export function FeatureGate({ children, context, featureKey, fallback, hideWhenLocked = false }: { children: ReactNode; context?: EntitlementUserContext; featureKey: FeatureKey; fallback?: ReactNode; hideWhenLocked?: boolean }) {
  if (canUseFeature(context, featureKey).allowed) return <>{children}</>;
  if (hideWhenLocked || !shouldShowProPreview(context, featureKey)) return null;
  return <>{fallback || <LockedFeatureCard featureKey={featureKey} />}</>;
}
