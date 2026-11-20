# V1 release readiness

Audit date: 2026-11-20. Starting production revision: bbca413 (#336).

V1 is not yet signed off. A green build and mocked tests do not establish real-device, production-data or offline field readiness.

## Completed in this stability pass

- Executed all 57 existing test/safety commands. The Leirdue health navigation assertion expected obsolete markup; corrected it and reran successfully.
- Added executable failure-path coverage for manual result creation: thrown auth/network errors release the form, and optional template failures open the already-saved result rather than stranding the shooter on the create form.
- Updated Next.js and its ESLint configuration to patch 16.4.6 after the installed 16.4.3 build reported a security warning.

## Remaining release gates, in priority order

1. Signed-in import and history: verify first-time and cached Leirdue year searches, ClayArena import, duplicate handling and saved scores/benchmark values with production-equivalent data.
2. Field recovery: exercise installed PWA on a phone with interrupted coverage, reload, reconnect, queued score-sheet edits and conflict recovery. Never call local-only work synced.
3. Scorecard review: verify the five-post 41/50 acceptance case, correction persistence, unknown marks and actual mobile layout (#160/#167/#150).
4. Account lifecycle: verify email confirmation, expired login, password reset, export and account controls from the deployed app.
5. Release decision: record evidence for the above, resolve blocking findings, then change beta messaging. Existing roadmap issues alone are not proof that a feature is absent; several describe work already implemented.

Future organizer tiers, new integrations and promotional assets are outside this release-stability pass. No database migration is part of this change.
