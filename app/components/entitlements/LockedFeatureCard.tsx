import type { FeatureKey } from "@/lib/entitlements/types";
import { FEATURE_CATALOG } from "@/lib/entitlements/features";
import { PRO_PREVIEW_COPY } from "@/lib/entitlements/check";
import { ProBadge } from "./ProBadge";

export function LockedFeatureCard({ featureKey, message }: { featureKey: FeatureKey; message?: string }) {
  const feature = FEATURE_CATALOG[featureKey];
  return <section className="card lockedFeatureCard" aria-label={`${feature.title} locked`}><div><ProBadge /><h2>{feature.title}</h2><p>{message || PRO_PREVIEW_COPY.unlockValue}</p><p className="small muted">{PRO_PREVIEW_COPY.proFeature}</p></div></section>;
}
