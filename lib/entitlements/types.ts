export type FeatureTier = "free" | "pro" | "pro_trial" | "ai_pro" | "beta_only" | "admin_only" | "compliance_access";
export type BillingMode = "disabled" | "beta_hidden" | "preview_only" | "enabled";
export type EntitlementPlan = "free" | "pro" | "internal" | "tester";

export type FeatureKey =
  | "results.manual_log" | "results.basic_history" | "training.basic_log" | "performance.basic_summary" | "performance.basic_result_vs_winner" | "import.leirdue_current_season" | "offline.basic_logging" | "shooting_grounds.basic_cleanup" | "data.compliance_access"
  | "import.leirdue_full_history" | "performance.advanced_trends" | "performance.ground_trends" | "performance.miss_patterns" | "performance.target_type_analysis" | "performance.equipment_comparison" | "training.shared_score_sheets" | "training.organizer_mode" | "offline.shared_score_sheets" | "coach_report.generate" | "coach_report.export" | "export.product_data.shared_score_sheets" | "export.product_data" | "export.coach_report_pdf" | "export.advanced_csv"
  | "ai.coach_report_summary" | "ai.performance_summary" | "ai.training_recommendations" | "ai.app_copilot" | "ai.miss_pattern_interpretation";

export type FeatureDefinition = {
  key: FeatureKey;
  tier: FeatureTier;
  title: string;
  description: string;
  costSensitive: boolean;
  visibleInBeta: boolean;
  allowTrial: boolean;
  defaultFreeTrialLimit?: number;
};

export type EntitlementUserContext = {
  userId?: string | null;
  isApprovedBetaUser?: boolean;
  isAdmin?: boolean;
  plan?: EntitlementPlan;
  billingMode?: BillingMode;
  trialUsage?: Partial<Record<FeatureKey, number>>;
  featureLimits?: Partial<Record<FeatureKey, number>>;
};

export type FeatureAccessResult = { allowed: boolean; feature: FeatureDefinition; reason?: "free" | "compliance" | "internal" | "admin" | "beta" | "pro" | "trial" | "billing_disabled" | "requires_pro" | "admin_only" | "beta_only" | "trial_limit_reached" };
