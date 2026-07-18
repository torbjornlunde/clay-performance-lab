# Entitlements foundation

The entitlement foundation centralizes feature keys, billing visibility and server guard behavior for a future Free/Pro split.

## Billing modes

- `disabled`: billing checks are effectively bypassed for development or emergency fallback.
- `beta_hidden`: default. Approved beta users keep current access and commercial Pro messaging remains hidden.
- `preview_only`: locked Pro previews may be shown, but checkout is still unavailable.
- `enabled`: Pro gates are active and server-side guards enforce Pro, trial, admin or internal allowance.

`NEXT_PUBLIC_BILLING_MODE` or `BILLING_MODE` can set the mode. Invalid or missing values fall back to `beta_hidden`.

## Feature tiers

Supported tiers are `free`, `pro`, `pro_trial`, `ai_pro`, `beta_only`, `admin_only` and `compliance_access`. Stable feature keys live in `lib/entitlements/features.ts` and are checked through `lib/entitlements/check.ts`.

## Guard locations inspected

Likely gated areas are Coach Report generation, AI scorecard/post-sign analysis routes, data exports, Performance analysis pages, Leirdue import flows, training score sheets, shared or multi-shooter training flows, equipment comparison, and dashboard/settings/menu links.

## Server-side cost protection

AI and LLM-cost features must call a server-side entitlement guard before model calls. The Coach Report AI generation route now builds a normalized entitlement context, requires paid-cost access for `ai.coach_report_summary`, and records usage after a successful model response. Future AI routes should follow the same pattern before calling OpenAI or any other paid model provider.
