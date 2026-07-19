# Clay Performance Lab – historical product idea register

Last audited: 19 July 2026

This document is the **append-only historical register of product ideas, feature concepts, constraints and significant design decisions** for Clay Performance Lab.

It is intentionally broader than `PRODUCT_ROADMAP.md`.

- `PRODUCT_ROADMAP.md` answers: **What are we building next and what is the current product direction?**
- This file answers: **What ideas have existed at any point, including implemented, changed, superseded, parked and rejected ideas?**

No idea should be deleted from this file merely because priorities change. When an idea changes, keep the original record and update its status/relationship.

## Status vocabulary

- **Implemented** – product capability exists in production or the underlying foundation is already delivered.
- **Partly implemented** – meaningful parts exist, but the full original idea does not.
- **Stabilizing** – implemented, but real-world use has exposed important friction or defects.
- **Next** – current near-term priority.
- **Planned** – accepted product direction, not necessarily next.
- **Later** – useful, but intentionally behind current priorities.
- **Parked** – preserve the idea, but no current plan to build it.
- **Superseded** – the original approach was replaced by a better one; keep it for history.
- **Needs review** – historical idea found during audit that needs an explicit keep/change/merge/park decision.

## Audit coverage

This register was assembled from the accessible project history, not from memory alone:

- project conversations and retained project context from the start of the app project in May 2026
- GitHub pull-request history through PR #221, including early product PRs and superseded PRs
- repository-wide GitHub issue search, including product-idea issues
- the original roadmap introduced in PR #130
- current `PRODUCT_ROADMAP.md`
- `TESTER_FEEDBACK.md`
- specialized roadmap documents for AI, reports, visual targets, mental performance, ClayArena, shooting glasses, choke selection, roles/access, launch positioning, PWA, scorecard import and Training Score Sheets
- the dedicated weather/environment and discipline-expansion roadmaps added in July 2026
- current known production status, so implemented ideas are not accidentally listed as future work

Duplicate PRs and repeated implementation attempts are represented as one product idea rather than separate ideas. Bugs that had no product/design implication are not treated as separate product ideas. Product-significant behavior discovered through bug fixes is included.

The only material that cannot be guaranteed here is content that is no longer accessible in any retained conversation, repository artifact or project context. Everything currently accessible and product-relevant has been folded into this register for review.

---

# A. Product identity, strategy and global principles

| ID | Idea / decision | Status | Historical source / note |
|---|---|---|---|
| PROD-001 | Product name `Clay Performance Lab`, short name `CPL`. | Implemented | Conversation, 28–29 May 2026. |
| PROD-002 | Tagline / positioning: `AI-powered performance analysis for clay target shooters`. | Implemented | Early product conversation. |
| PROD-003 | Build a serious performance-analysis product rather than a generic scorekeeper. | Planned | Early product direction; AI-native strategy roadmap. |
| PROD-004 | Mobile-first web app/PWA first; consider native/App Store packaging later only if real PWA limitations justify it. | Partly implemented | Early architecture discussion; PWA roadmap. |
| PROD-005 | Stack: Next.js/React + Supabase + GitHub + Vercel. | Implemented | Initial app architecture. |
| PROD-006 | Simple and advanced users must coexist: result-only should remain easy while detailed users can go deep. | Planned | Repeated product decision. |
| PROD-007 | Progressive disclosure: advanced setup, equipment and target detail should normally be collapsed/optional. | Partly implemented | Repeated field-use feedback and UX PRs. |
| PROD-008 | Real-world core friction outranks speculative features. | Planned | Product roadmap principle. |
| PROD-009 | Training and Competition are distinct data domains and must not be mixed misleadingly. | Implemented | Core data principle. |
| PROD-010 | AI should add value from real structured shooting data, not merely generate generic prose. | Planned | AI-native strategy. |
| PROD-011 | Deterministic rules/validation should protect analysis before AI synthesis. | Partly implemented | Session/Coach Report evidence engines. |
| PROD-012 | App UI should be English for international use, while official discipline names remain unchanged. | Implemented | Repeated product constraint. |
| PROD-013 | Norwegian-specific disciplines remain supported but sort lower for non-Norwegian profiles. | Implemented | PR #208. |
| PROD-014 | Premium visual identity: black/charcoal with champagne/gold; subtle Nordic/Scandinavian character rather than heavy Viking decoration or bright orange/3D branding. | Partly implemented | Branding conversations. |
| PROD-015 | Product should be internationally extensible rather than defined by Leirdue.net or Norwegian workflows. | Planned | Dashboard/menu cleanup and discipline strategy. |
| PROD-016 | A feature is not considered finished until code, database where relevant, and real user flow have been checked. | Planned | Master roadmap principle. |
| PROD-017 | Large product PRs should update roadmap/idea documentation. | Planned | PR #130 and current roadmap. |
| PROD-018 | Preserve source/auditability when imported or normalized data is corrected; do not silently rewrite history. | Partly implemented | Leirdue, shooting-ground and import designs. |

---

# B. Authentication, onboarding, navigation and general app UX

| ID | Idea / decision | Status | Historical source / note |
|---|---|---|---|
| UX-001 | Email/password login and account creation. | Implemented | Initial MVP. |
| UX-002 | Public landing should not expose protected Dashboard actions to unauthenticated users. | Implemented | Early PRs #9/#11. |
| UX-003 | Auth-aware navigation: show workspace navigation only when signed in. | Implemented | Early auth/navigation work. |
| UX-004 | Installed PWA should route an already authenticated user directly into the app instead of showing a false login/public landing state. | Next | Real iPhone/PWA feedback, July 2026. |
| UX-005 | An authenticated user opening `/login` should be redirected into the app. | Next | PWA auth-startup feedback. |
| UX-006 | Protected pages must still reject truly unauthenticated users. | Planned | Auth constraint. |
| UX-007 | Avoid visible auth-state flashes between public and signed-in UI. | Planned | PWA startup redesign. |
| UX-008 | One coherent persistent global menu across signed-in pages. | Implemented | Issue #133 / PR #134. |
| UX-009 | Keep Dashboard and Performance as the most direct high-level navigation concepts; use Menu for the rest. | Implemented | Issue #133 / PR #134, later dashboard cleanup. |
| UX-010 | Dashboard should be the main workflow chooser rather than an overloaded top header. | Implemented | June 2026 navigation decisions. |
| UX-011 | Dashboard core actions should stay focused around logging Competition, logging Training, Performance and high-value product entry points. | Partly implemented | Early dashboard constraint; later Coach Report added. |
| UX-012 | Simple Training Log belongs inside `Log training`, not as a separate dashboard button. | Implemented | User constraint, 9 June 2026. |
| UX-013 | Global Settings area for appearance and app preferences. | Implemented | PR #134. |
| UX-014 | System / Light / Dark appearance modes with local persistence and no theme flash. | Implemented | PRs #99–#104. |
| UX-015 | Light theme should keep a premium warm ivory/stone/champagne character. | Implemented | Theme direction. |
| UX-016 | Field Mode may intentionally remain dark for outdoor scoring even when general app appearance is Light. | Implemented | Theme/Field Mode work. |
| UX-017 | Maintain strong app-wide contrast regression protection rather than patching one page at a time. | Implemented | Issue #149 / PR #153/#206. |
| UX-018 | Contextual onboarding/help for first use, with `Get started`, `Remind me later` and `Dismiss tips`. | Implemented | PRs #185–#186. |
| UX-019 | Global `Help / Getting started` should reopen onboarding even after dismissal. | Implemented | PR #185/#186. |
| UX-020 | Contextual help on complex flows such as import and Training Score Sheet. | Implemented | PR #185. |
| UX-021 | Visible app-style back button on deeper screens. | Planned | July 2026 PWA feedback. |
| UX-022 | Left-edge swipe-back gesture where it does not conflict with horizontal controls. | Planned | July 2026 PWA feedback. |
| UX-023 | Avoid horizontal scrolling on ordinary mobile workflows. | Implemented / ongoing | Repeated mobile UX work. |
| UX-024 | Continue reducing excessive vertical whitespace and oversized cards where real use shows unnecessary scrolling. | Planned | Performance and scorecard feedback. |
| UX-025 | Keep touch targets usable even when making the UI denser. | Planned | Mobile density principle. |
| UX-026 | Long-lived mobile scoring screens should prevent phone auto-lock when the user wants it. | Implemented | Wake Lock, PR #106. |
| UX-027 | User data export should be directly available from the global menu. | Implemented | PR #134. |
| UX-028 | App should offer a small, reliable official-rules links page containing links to official sources rather than copying rulebook text. | Needs review | Issue #137. |

---

# C. Competition creation, logging and result workflows

| ID | Idea / decision | Status | Historical source / note |
|---|---|---|---|
| COMP-001 | Create a full Competition session with editable metadata and discipline-specific setup. | Implemented | Initial MVP / PRs #1–#3. |
| COMP-002 | Edit Competition setup after creation without silently destroying existing details. | Implemented | Early session edit work. |
| COMP-003 | Store an explicit competition date separate from creation timestamp. | Implemented | PR #9. |
| COMP-004 | Optional shooting-ground/location field on Competition sessions. | Implemented | PR #23. |
| COMP-005 | Result-only Competition entry for users who do not want full setup or miss logging. | Implemented | PR #6 onward. |
| COMP-006 | Calculate score from total targets and logged misses when detailed logging is complete enough. | Implemented | PR #6; later corrected pair weighting. |
| COMP-007 | Allow official/manual own score to coexist with calculated score and surface mismatches honestly. | Implemented | Early score model. |
| COMP-008 | Store winning score and compare performance relative to winner. | Implemented | PR #5 onward. |
| COMP-009 | Quick Competition score with course/post breakdown and hit-or-miss entry without full target detail. | Implemented | PR #90. |
| COMP-010 | Quick-score course order can start from a chosen course and wrap cyclically. | Implemented | PR #90. |
| COMP-011 | Competition logging should have three conceptual depth levels: Quick result, Detailed result by course/post, Live target-by-target. | Planned | Later architecture discussion. |
| COMP-012 | Personal live target-by-target Competition scorecard for one signed-in shooter first. | Planned | Product conversation / roadmap. |
| COMP-013 | Live Competition scoring and Training Score Sheet may share UI/state primitives but should remain separate domain/persistence flows. | Planned | Architecture discussion. |
| COMP-014 | Official result source and personal detailed logging must be able to coexist on the same Competition. | Planned | Later Competition live-scorecard direction. |
| COMP-015 | Importing/attaching an official result must not destroy the shooter’s personal target/miss detail. | Planned | Import architecture principle. |
| COMP-016 | Absence of a logged miss must not automatically be interpreted as a hit unless the target-level record is explicitly complete. | Planned | Completeness principle. |
| COMP-017 | Pair/double semantics must be discipline-correct, including both-target misses counting as two misses. | Implemented / planned expansion | PR #87 and future discipline modules. |
| COMP-018 | Busy competition-week flow should prioritize fast result + scorecard photo; detailed target setup can be added later. | Planned | Torbjørn NM-week feedback. |
| COMP-019 | Support partial detail after a Competition: missed targets only, difficult stands only, or full setup when time allows. | Planned | TESTER_FEEDBACK / Visual Target Builder. |
| COMP-020 | Early Leirdue/result-source link entry during Competition creation/import to avoid after-the-fact editing. | Implemented | PRs #195–#196. |
| COMP-021 | After fast result/import, prompt gently to add missed-target detail without blocking completion. | Implemented | PRs #195–#196. |
| COMP-022 | Preferred missed-target CTA when misses exist: `Describe the missed targets`. | Planned copy cleanup | Conversation. |
| COMP-023 | Preferred CTA when no misses are yet entered: `Add missed targets`. | Planned copy cleanup | Conversation. |
| COMP-024 | Helper message: user may keep the result as-is or add details only for targets missed. | Planned copy cleanup | Conversation. |
| COMP-025 | Competition activity summary: all-time competition count. | Implemented | Simon feedback / PR #145/#196. |
| COMP-026 | Competition activity summary: all-time competition target count. | Implemented | Simon feedback. |
| COMP-027 | Competition activity summary: selected-year competition count and targets with year selector. | Implemented | Simon feedback. |
| COMP-028 | Competition activity must exclude Training and avoid double-counting exact duplicate imported results. | Implemented | Simon feedback / PR #196. |
| COMP-029 | Competition activity should remain available even though it no longer belongs as a large card on the main Performance dashboard. | Needs review | Performance cleanup changed presentation, not product value. |

---

# D. Miss logging, miss review and session analysis foundations

| ID | Idea / decision | Status | Historical source / note |
|---|---|---|---|
| MISS-001 | Log a miss against the relevant course/post/stand/plate and target/presentation. | Implemented | Initial MVP. |
| MISS-002 | For pairs, store which target was missed: first, second, both or unknown. | Implemented | Early detailed miss work. |
| MISS-003 | Store separate details/reasons for first and second missed target in a pair. | Implemented | Early user requirement. |
| MISS-004 | Do not ask which target was missed for a single presentation; infer `Single target`. | Implemented | PR #27. |
| MISS-005 | Allow editing and deleting previously logged misses. | Implemented | PR #28. |
| MISS-006 | Provide a session-level `Review misses` area. | Implemented | PR #28. |
| MISS-007 | Keep miss logging ready for the next miss after save rather than navigating away. | Implemented | PR #48 / Samuel feedback. |
| MISS-008 | Preserve useful last-used setup selections between consecutive misses while clearing only free-text comments. | Implemented | PR #26. |
| MISS-009 | Support actual presentation override when what was shot differs from base programme. | Implemented | PR #31. |
| MISS-010 | Support reversing pair shooting order and preserve that in analysis/export. | Implemented | PR #31. |
| MISS-011 | Use structured main reason, where-miss and target read fields, but allow uncertainty. | Implemented | Existing miss model. |
| MISS-012 | Unknown cause fields must not dominate analysis simply because scorecard imports do not know the cause. | Implemented / ongoing | Issues #150/#151, deterministic analysis. |
| MISS-013 | Rule-based/deterministic main pattern before AI, with conservative thresholds. | Implemented | PR #27 onward. |
| MISS-014 | Analysis should recommend practical verification/training rather than present weak correlations as certainty. | Partly implemented | Session/Coach Report evidence work. |
| MISS-015 | Session analysis should use reliable scorecard positions, target setup, Competition context and history when available. | Partly implemented | Issue #150/#151, PR #154. |
| MISS-016 | Compare Training history and Competition history separately in analysis. | Implemented foundation | PR #154 and reports. |
| MISS-017 | Exclude future-dated sessions from historical comparison. | Implemented | PR #154. |
| MISS-018 | Deterministic focus areas should be few and high-signal rather than a long list. | Planned | Performance discussion. |
| MISS-019 | Suggested threshold before strong focus areas: roughly 5 relevant sessions or 10 logged misses. | Needs review | Earlier design discussion; exact threshold should be reviewed. |
| MISS-020 | Empty state for insufficient detail should encourage adding missed-target detail rather than generate generic advice. | Planned | Performance discussion. |

---

# E. Target definitions, programmes and visual target modelling

| ID | Idea / decision | Status | Historical source / note |
|---|---|---|---|
| TARGET-001 | Structured target definition fields: target type, direction, angle, speed, distance, difficulty and notes. | Implemented | Early Compak target definitions; PR #127 normalization. |
| TARGET-002 | Machine/target labels A–F for Compak-style courses. | Implemented | Initial Compak model. |
| TARGET-003 | Add `Overhead` as a target type/direction where relevant. | Partly implemented | PR #5; should remain in canonical target taxonomy review. |
| TARGET-004 | Save target definitions per course rather than forcing all courses to be edited at once. | Implemented | PR #5. |
| TARGET-005 | Copy/reuse target definitions between courses/rounds. | Implemented foundation / planned refinement | PR #31/#32. |
| TARGET-006 | Separate each physical target from presentations that reference it so repeated targets are defined once. | Implemented | Issue #148 / PR #155. |
| TARGET-007 | Common repeated-pair setup should allow defining A and B once and applying `5 × A → B` or equivalent. | Implemented | Issue #158 / PR #159. |
| TARGET-008 | Keep a full individual presentation editor for genuinely mixed programmes. | Implemented | PR #159. |
| TARGET-009 | Preserve legacy/conflicting occurrence detail rather than silently canonicalizing it. | Implemented | PR #155. |
| TARGET-010 | Course/program overrides may change pair type, report/simo/on-report behavior or shooting order without altering the base scheme definition. | Partly implemented / planned | PR #31 and roadmap. |
| TARGET-011 | Visual Target Builder based on speed, angle, distance and position relative to shooter. | Planned | NM-week tester feedback / visual builder roadmap. |
| TARGET-012 | Use a visual representation to describe presentations that dropdowns cannot capture well. | Planned | NM-week tester feedback. |
| TARGET-013 | Structured target profile plus free text for hard-to-describe targets. | Planned | Product roadmap. |
| TARGET-014 | `Uncertain/complex` tagging for presentations that cannot be confidently normalized. | Planned | Product discussion. |
| TARGET-015 | AI may draft a target description from voice, text or photo, always with user review before save. | Planned | Visual Target Builder feedback. |
| TARGET-016 | Optional image/video evidence attached to a target/presentation. | Later | Product discussion. |
| TARGET-017 | Shared target/course library where users can review before importing. | Later | Product roadmap. |
| TARGET-018 | Competition target definitions created by one shooter can later be reused by others with review/confirmation. | Planned | Shared competition setup concept. |
| TARGET-019 | Target definitions should remain editable after the session. | Implemented / ongoing | Early product requirement. |
| TARGET-020 | Post/stand-wide organizer instructions and source text should be stored separately from personal notes. | Implemented | Post-sign import/private notes separation. |

---

# F. Photo, scorecard and sign import

| ID | Idea / decision | Status | Historical source / note |
|---|---|---|---|
| SCORE-001 | Photograph a paper Competition scorecard and extract target-level result data. | Implemented | PR #118 onward. |
| SCORE-002 | Photograph/import a Training scorecard into a Training Score Sheet. | Implemented | PR #217. |
| SCORE-003 | Camera and photo-library entry points should both be available. | Implemented | Scorecard/photo UX work. |
| SCORE-004 | Resize/orient large phone images client-side where possible before expensive analysis. | Partly implemented / needs hardening | PR #118 and later review. |
| SCORE-005 | Optional crop-before-analysis so irrelevant parts of the image can be removed. | Implemented | PR #120/#175. |
| SCORE-006 | AI analysis output must use a strict schema and deterministic normalization. | Implemented | Scorecard architecture. |
| SCORE-007 | Review before any data is written. | Implemented | Locked product principle. |
| SCORE-008 | Never silently overwrite existing score/miss detail from a photo import. | Implemented | Scorecard apply safety. |
| SCORE-009 | Duplicate/image-fingerprint protection and idempotent retry. | Implemented | Scorecard architecture / PR #220. |
| SCORE-010 | Save pending image/review locally so temporary loss of connection or navigation does not destroy work. | Implemented foundation | IndexedDB scorecard flow. |
| SCORE-011 | Queue/retry photo analysis when offline rather than losing the captured image. | Partly implemented | Scorecard/post-sign local queues. |
| SCORE-012 | Structure discovery from the scorecard so the user need not preconfigure posts and targets. | Implemented | PR #217/#220. |
| SCORE-013 | Variable target counts per post must be supported. | Implemented | PR #123/#217/#220. |
| SCORE-014 | Existing known setup should be protected by a deterministic fingerprint between analyze and apply. | Implemented | PR #126. |
| SCORE-015 | User must be able to correct every cell directly among Hit / Miss / Unknown. | Stabilizing / Next | Real iPhone feedback July 2026. |
| SCORE-016 | AI interpretation must be a suggestion; a valid user correction must be able to resolve reconciliation conflicts. | Next | Real iPhone feedback. |
| SCORE-017 | Original scorecard image should remain immediately available throughout review. | Next | Real iPhone feedback. |
| SCORE-018 | Sticky/minimized reference image with tap to fullscreen and zoom. | Next | Real iPhone feedback. |
| SCORE-019 | Review should keep the active post close to the relevant image context and avoid long back-and-forth scrolling. | Next | Real iPhone feedback. |
| SCORE-020 | Show post structure compactly, e.g. `16 posts · 120 targets`. | Next | Real iPhone feedback. |
| SCORE-021 | Prefer `Default targets per post + exceptions` rather than one large control for every post. | Next | Real iPhone feedback. |
| SCORE-022 | Full structure editor should be hidden until explicitly requested. | Next | Real iPhone feedback. |
| SCORE-023 | Per-post review workflow with clear `Save post and next` progress. | Implemented foundation, needs UX reconciliation | Issue #160 / PR #161. |
| SCORE-024 | Bulk resolving unknown cells should be scoped to a post and require clear confirmation. | Implemented | Issue #160 / PR #161. |
| SCORE-025 | AI should distinguish active/inactive/blank/uncertain cells and never fabricate positions from totals alone. | Implemented | PR #217. |
| SCORE-026 | Explicit AI `uncertain` cells remain unknown until user review, even if totals could mathematically reconcile them. | Implemented | PR #217 safety rule. |
| SCORE-027 | Better multi-shooter candidate detection and selection on photographed scorecards. | Planned | Known scorecard limitation. |
| SCORE-028 | A malformed AI response that treats physical post rows as separate shooters should be deterministically repaired when safe. | Implemented | PR #163. |
| SCORE-029 | Stronger local persistence and safe retry after browser/app interruption. | Planned | Known limitation. |
| SCORE-030 | Harden server inputs and limits for photo import. | Planned | Known limitation. |
| SCORE-031 | Imported/result-only results should later be upgradeable with richer scorecard/miss/target detail. | Planned | Product roadmap. |
| SCORE-032 | Photograph post/stand signs and use AI to draft target/presentation setup. | Implemented foundation | PR #114. |
| SCORE-033 | Post-sign analysis must preserve visible notation and avoid guessing pair type from punctuation alone. | Implemented | PR #120. |
| SCORE-034 | Post-sign review should keep a sticky reference thumbnail/fullscreen photo near the detected programme. | Implemented | PR #120. |
| SCORE-035 | Post-sign photos should have a local pending queue and survive offline capture. | Implemented foundation | PR #114. |
| SCORE-036 | English Sporting should reuse per-stand sign import rather than require a separate system. | Implemented | PR #122. |

---

# G. Training logging and Training Score Sheets

| ID | Idea / decision | Status | Historical source / note |
|---|---|---|---|
| TRAIN-001 | Simple Training Log requiring only date + targets fired, with optional hits, discipline, location and notes. | Implemented | Conversation / June 2026 work. |
| TRAIN-002 | Simple Training Log must stay inside `Log training`, not become a separate dashboard workflow. | Implemented | User constraint. |
| TRAIN-003 | Simple logs should remain upgrade-friendly so more detail can be added later. | Planned | Early design. |
| TRAIN-004 | Shared Training Score Sheet where one organizer records multiple shooters. | Implemented | Core shared-training concept. |
| TRAIN-005 | Add multiple shooter names with minimal friction. | Implemented baseline | Training Score Sheet. |
| TRAIN-006 | Live target-by-target Hit/Miss scoring per shooter and post. | Implemented | PR #216. |
| TRAIN-007 | Automatic per-post and total calculation from target-level results. | Implemented | Training Score Sheet. |
| TRAIN-008 | Target-level results are authoritative when present; manual totals must not silently override them. | Implemented | PR #62. |
| TRAIN-009 | Variable target counts by post/stand. | Implemented | PR #174/#177. |
| TRAIN-010 | Preserve existing score data when increasing setup size; confirm before destructive reductions. | Implemented | PR #62/#68. |
| TRAIN-011 | Local autosave and recovery for live scoring. | Implemented | PR #62/#64. |
| TRAIN-012 | Clear sync status such as local, syncing, synced and failed. | Implemented foundation | PR #62/#64. |
| TRAIN-013 | Recovery choice between newer local draft and server version rather than silent overwrite. | Implemented | PR #64. |
| TRAIN-014 | Focused one-handed Field Mode with setup and nonessential details hidden during live scoring. | Implemented | PR #68 onward. |
| TRAIN-015 | Sticky live context showing current post/stand, current shooter, next shooter, target and score. | Implemented | PR #63. |
| TRAIN-016 | Post-complete state requiring explicit `Next shooter`, with correction available. | Implemented | PR #63. |
| TRAIN-017 | Undo last live input. | Implemented | Training Score Sheet. |
| TRAIN-018 | Prevent screen auto-lock during active live scoring, default-on but user-controllable. | Implemented | PR #106. |
| TRAIN-019 | Training Score Sheet archive with open/edit, draft/unsynced visibility and safe delete. | Implemented | PR #65. |
| TRAIN-020 | Compact ranked Results/Summary after a session. | Implemented | PR #67. |
| TRAIN-021 | Copy a clean plain-text result summary. | Implemented | PR #67. |
| TRAIN-022 | Quick-start presets for common Training Score Sheets such as Compak Sporting and Leirduesti while preserving custom setup. | Implemented | PR #71. |
| TRAIN-023 | Do not let presets overwrite meaningful unsynced local drafts. | Implemented | PR #71. |
| TRAIN-024 | Live name autocomplete when organizer adds a shooter. | Planned | Shared training roadmap. |
| TRAIN-025 | Suggest likely existing profiles to reduce typos/duplicates. | Planned | Shared training roadmap. |
| TRAIN-026 | Match using name + country/profile context; do not require club in the first version. | Planned | Locked decision. |
| TRAIN-027 | A user should later discover a Training Score Sheet entry where they were added. | Planned | Shared training roadmap. |
| TRAIN-028 | User can claim/confirm their own participant result. | Planned | Shared training roadmap. |
| TRAIN-029 | After claiming, each participant can add personal miss reasons, assumptions and notes without altering other shooters. | Planned | Shared training roadmap. |
| TRAIN-030 | Shared course/target definitions are visible to participants for reviewing misses. | Planned | Shared training roadmap. |
| TRAIN-031 | Compak Sporting Training Score Sheet should retain the actual A–F programme/pair structure for each course. | Planned | Shared training roadmap. |
| TRAIN-032 | Shared Training results must enter Coach/Performance reports clearly separated from Competition. | Planned | Shared training roadmap. |
| TRAIN-033 | Notify users when they are added to a shared training session or have a result ready to claim/review. | Planned | Notifications/shared training. |
| TRAIN-034 | Protect removal of a shooter who already has recorded data; cleanup transient state safely. | Implemented | PR #112. |
| TRAIN-035 | English Skeet should be the first new skeet training variant because an active tester uses it. | Planned | Samuel feedback / `ROADMAP_SKEET_VARIANTS.md`. |
| TRAIN-036 | Exact English Skeet sequence, terminology and scorecard must be confirmed with Samuel before implementation. | Planned | TESTER_FEEDBACK. |

---

# H. Offline and local-first behavior

| ID | Idea / decision | Status | Historical source / note |
|---|---|---|---|
| OFF-001 | Critical range logging must work through temporary or absent mobile coverage. | Planned / partial foundation | Core roadmap priority. |
| OFF-002 | Open relevant cached sessions without coverage. | Planned | Offline roadmap. |
| OFF-003 | Create a safe basic Training/Competition session offline where feasible. | Planned | Offline roadmap. |
| OFF-004 | Record Hit/Miss and corrections locally while offline. | Partly implemented | Training Score Sheet local drafts; broader app pending. |
| OFF-005 | Explicit states: local, waiting to sync, synced, conflict. | Planned / partial | Training foundation. |
| OFF-006 | Safe automatic or user-visible sync when connectivity returns. | Planned / partial | Training/private note foundations. |
| OFF-007 | Duplicate protection during offline retry/sync. | Planned / partial | Import/local draft designs. |
| OFF-008 | Simple conflict handling rather than silent overwrite. | Planned / partial | Local-first designs. |
| OFF-009 | First broad offline scope should be Training Score Sheet, simple miss logging and required session data, not the entire app. | Planned | Locked principle. |
| OFF-010 | AI analysis requests should queue/wait until network is available rather than block local capture. | Planned / partial | Post-sign/scorecard queues. |
| OFF-011 | Private session/post notes use local drafts and pending-sync queue. | Implemented | PR #188. |
| OFF-012 | Pending local private-note edits win over server reload until sync is resolved. | Implemented | PR #188. |
| OFF-013 | Consolidate separate local-draft/photo queues into a coherent app-wide local-first sync model over time. | Needs review | Inference from several independent local queues; valuable architecture cleanup. |

---

# I. Compak Sporting and FITASC scheme utility

| ID | Idea / decision | Status | Historical source / note |
|---|---|---|---|
| FITASC-001 | Select Compak scheme/program first; app derives Single/Report/Simo from verified programme data. | Implemented | Early user constraint. |
| FITASC-002 | Whole Compak Competition uses one global Inline/Squad setting, not per course. | Implemented | Early user constraint. |
| FITASC-003 | Total targets for Compak should be derived from programme/course structure rather than manually entered. | Implemented | Early user constraint. |
| FITASC-004 | Squad mode stores shooter number 1–6 and start plate; shooter 6 starts on plate 1 in the original basic model. | Implemented / refined | Early Compak requirements. |
| FITASC-005 | Support correct Squad rotation modes such as waiting shooter and continuous rotation. | Implemented | PR #66. |
| FITASC-006 | Keep Inline behavior distinct from Squad behavior. | Implemented | PR #66/#69. |
| FITASC-007 | Safe Compak defaults for Training: 5 plates, 25 targets, Squad, waiting shooter. | Implemented | PR #69. |
| FITASC-008 | Verified FITASC scheme data only; never invent A–F programme details. | Implemented principle | PR #10 and imports. |
| FITASC-009 | Browsable FITASC scheme library/viewer inside the app. | Implemented | Early PRs. |
| FITASC-010 | Fullscreen landscape-friendly scheme view for use on the range. | Implemented | PR #40. |
| FITASC-011 | Focused single-stand view in addition to full scheme. | Historical / needs review | PRs #43–#47 were stale/superseded; concept may still be useful. |
| FITASC-012 | Swipe/previous/next navigation between stands in focused scheme view. | Historical / needs review | Stale PRs #43–#47. |
| FITASC-013 | Optional tactile/vibration feedback when changing stand in range viewer. | Historical / needs review | Stale PR #46 concept. |
| FITASC-014 | FITASC scheme viewer may be useful to shooters, judges/referees and organizers independent of logging. | Implemented utility | Early product direction. |

---

# J. Discipline expansion and discipline-specific architecture

| ID | Idea / decision | Status | Historical source / note |
|---|---|---|---|
| DISC-001 | Formal configuration/profile architecture for disciplines rather than one universal detailed scorecard. | Planned | Discipline expansion roadmap. |
| DISC-002 | Support three depth levels where useful: result-only, detailed breakdown and live target-by-target. | Planned | Discipline expansion roadmap. |
| DISC-003 | Preserve exact canonical discipline and source variant instead of merging distinct disciplines only because names look similar. | Partly implemented | Import normalization principle. |
| DISC-004 | Rule-set/version metadata where rule changes materially affect scorecard or analysis. | Planned | Discipline/Skeet roadmap. |
| DISC-005 | Leirduesti first-class support. | Implemented | PR #24 onward. |
| DISC-006 | Kompakt leirduesti stored separately from Compak Sporting despite shared mechanics where appropriate. | Implemented | PR #29. |
| DISC-007 | Compak Sporting first-class support. | Implemented | Core app. |
| DISC-008 | Sporttrap first-class support. | Implemented baseline | Existing app. |
| DISC-009 | English Sporting / stand-based sporting support. | Implemented baseline | PR #122 and post model. |
| DISC-010 | FITASC Sporting eventually gets true discipline-correct first-class support. | Planned | Discipline expansion roadmap. |
| DISC-011 | Do not include FITASC Sporting in shared Competition setup templates until serializer/data model is proven correct. | Planned constraint | PR #128 and roadmap. |
| DISC-012 | Jegertrap / Nordisk trap remains a canonical combined app discipline for current import/support purposes while generic Trap stays distinct. | Implemented | PR #140. |
| DISC-013 | Reusable fixed-trap programme engine, not a one-off Jegertrap implementation. | Implemented foundation | Issue #141 / PR #143. |
| DISC-014 | Fixed-trap engine supports per-series start stand and block rotation. | Implemented foundation | PR #143. |
| DISC-015 | Strengthen full detailed/live Jegertrap / Nordisk trap support. | Planned | Discipline roadmap. |
| DISC-016 | Olympic Trap first-class support. | Planned | Discipline roadmap. |
| DISC-017 | Universal Trench support. | Planned | Discipline roadmap. |
| DISC-018 | American/ATA Trap variants when user demand justifies it. | Later | Discipline roadmap. |
| DISC-019 | Double Trap support where active/historical value justifies it. | Later | Discipline roadmap. |
| DISC-020 | Shared skeet engine/configuration foundation. | Planned | Samuel feedback. |
| DISC-021 | English Skeet first released skeet variant. | Planned | Samuel feedback. |
| DISC-022 | Olympic / International Skeet support using shared skeet foundation but distinct rules/statistics. | Planned | Samuel feedback / discipline roadmap. |
| DISC-023 | American Skeet support using shared foundation but distinct variant. | Later | Samuel feedback. |
| DISC-024 | Other verified national skeet variants may be added without mixing them in stats. | Later | Skeet strategy. |
| DISC-025 | Skeet analysis by station. | Planned | Discipline-specific visuals. |
| DISC-026 | Skeet analysis by high-house vs low-house where relevant. | Planned | Discipline-specific visuals. |
| DISC-027 | Skeet singles vs doubles and first/second target patterns. | Planned | Discipline-specific visuals. |
| DISC-028 | Trap analysis by station/stand. | Planned | Discipline roadmap. |
| DISC-029 | Trap analysis by target direction/category where source detail exists. | Planned | Discipline roadmap. |
| DISC-030 | Trap first-shot vs second-shot outcomes where relevant. | Planned | Discipline roadmap. |
| DISC-031 | Discipline-specific visual dashboards rather than one generic Performance visualization. | Planned | User discussion July 2026. |
| DISC-032 | Skeet view should visually show all stands and percentage per stand. | Planned | User discussion. |
| DISC-033 | Similar discipline-specific visual concepts for Trap, Sporting and Compak. | Planned | User discussion. |
| DISC-034 | Expand eventually to the major clay-target shotgun disciplines, with further disciplines added based on real demand. | Planned | Discipline expansion roadmap. |

---

# K. Rules and reference assistant

| ID | Idea / decision | Status | Historical source / note |
|---|---|---|---|
| RULE-001 | Simple page containing direct links to official rules sources for supported disciplines. | Needs review | Issue #137. |
| RULE-002 | Rules page should link only; do not copy or summarize official rulebooks as static app content. | Needs review | Issue #137. |
| RULE-003 | AI/chat-style rules assistant grounded in official rulebooks. | Later | Issue #139. |
| RULE-004 | Rules assistant answers natural-language practical questions for shooters, referees and organizers. | Later | Issue #139. |
| RULE-005 | Rules answers must be source-grounded, identify discipline/rulebook context and avoid pretending uncertain answers are definitive. | Later | Issue #139 concept. |
| RULE-006 | Rules assistant can be a user-acquisition feature even for users who have not logged performance data. | Later | Issue #139. |

---

# L. Leirdue.net, external results and data imports

| ID | Idea / decision | Status | Historical source / note |
|---|---|---|---|
| IMPORT-001 | Store original Leirdue.net result URL on a Competition. | Implemented | PR #1 onward. |
| IMPORT-002 | Open the original Leirdue result from session/ground detail. | Implemented | PR #213. |
| IMPORT-003 | Search Leirdue.net by shooter/year/disciplines and present candidates for review. | Implemented | PR #30 onward. |
| IMPORT-004 | Explicit review/edit before saving any Leirdue result. | Implemented | PR #30. |
| IMPORT-005 | Conservative parser classification and confidence categories rather than auto-importing everything found. | Implemented | PR #30 onward. |
| IMPORT-006 | Duplicate protection across imported and manual records. | Implemented | Leirdue import. |
| IMPORT-007 | Manual direct Leirdue URL paste as fallback when broad search misses an event. | Implemented | PR #91. |
| IMPORT-008 | Possible name matches should be shown for review instead of silently rejected. | Implemented | PR #92. |
| IMPORT-009 | Normalize names robustly, including Nordic characters and appended club text, while preserving review. | Implemented | PR #92. |
| IMPORT-010 | Persistent/shared parsed cache to reduce repeated crawling and speed broad search. | Implemented | PR #93 onward. |
| IMPORT-011 | Bounded continuation batches rather than long uncontrolled frontend crawling. | Implemented | PR #94. |
| IMPORT-012 | Automatic refresh of recent/current Leirdue results. | Implemented | PR #178/#179. |
| IMPORT-013 | Admin health status for background Leirdue refresh. | Implemented | PR #179. |
| IMPORT-014 | Admin email alerts for failed/degraded Leirdue refresh and recovery, rate-limited. | Implemented | PR #182. |
| IMPORT-015 | User-controlled manual re-check of a saved Leirdue source and explicit review before applying source changes. | Implemented | PR #183. |
| IMPORT-016 | Never silently overwrite a saved Competition because the external source changed. | Implemented principle | PR #183. |
| IMPORT-017 | Imported result can be saved even if winning score is unknown. | Implemented | PR #172. |
| IMPORT-018 | Profile-based Leirdue import suggestions using shooter name/aliases later. | Planned | Product roadmap. |
| IMPORT-019 | Free tier may eventually be limited to current-season history while Pro unlocks older/full import history. | Later | Earlier monetization idea. |
| IMPORT-020 | Normalize source discipline aliases carefully, including keeping generic Trap separate from `Jegertrap / Nordisk trap`. | Implemented | PR #140. |
| IMPORT-021 | Scorecard import and Leirdue import should not automatically apply shared Competition templates in the current model. | Planned constraint | PR #129 historical limitation. |
| IMPORT-022 | ClayArena import from a pasted public URL. | Planned | ClayArena roadmap. |
| IMPORT-023 | ClayArena flow: parse page, choose shooter row, review and confirm. | Planned | ClayArena roadmap. |
| IMPORT-024 | Store source system and source URL for ClayArena/imported results. | Planned | ClayArena roadmap. |
| IMPORT-025 | ClayArena HTML first; PDF fallback later. | Planned | ClayArena roadmap. |
| IMPORT-026 | No background ClayArena crawling in v1. | Planned constraint | ClayArena roadmap. |
| IMPORT-027 | If source has only totals, save result-only rather than invent target-level detail. | Planned | Import principle. |
| IMPORT-028 | Architecture should allow additional federation/result-system imports later. | Later | International expansion direction. |

---

# M. Shared Competition setups and organizer product

| ID | Idea / decision | Status | Historical source / note |
|---|---|---|---|
| SHARE-001 | A shooter/organizer can explicitly publish a Competition target setup for reuse. | Implemented | PR #128. |
| SHARE-002 | Shared setup visibility modes: private, link-only and searchable. | Implemented | PR #128. |
| SHARE-003 | Server builds a whitelisted snapshot rather than trusting client-supplied template payload. | Implemented | PR #128. |
| SHARE-004 | Shared setup must exclude scores, misses, reasons, participants, equipment, email, user IDs, private notes and other personal performance data. | Implemented principle | PR #128. |
| SHARE-005 | Shared templates may be incomplete but must clearly disclose completeness. | Implemented | PR #128. |
| SHARE-006 | Search suggestions use discipline, name, shooting ground, date, target count and completeness. | Implemented | PR #129. |
| SHARE-007 | Exact date has strongest weight; ±1 day can still suggest a likely setup. | Implemented | PR #129. |
| SHARE-008 | User must explicitly select/confirm a suggested setup; never auto-apply. | Implemented | PR #129. |
| SHARE-009 | Suggested setup is applied to the same saved session/result, not a hidden duplicate session. | Implemented | PR #129. |
| SHARE-010 | Normal Competition creation and result-only can use template suggestions. | Implemented | PR #129. |
| SHARE-011 | Scorecard import and Leirdue import do not use automatic template suggestions yet. | Planned constraint | PR #129. |
| SHARE-012 | FITASC Sporting excluded until a safe discipline-correct serializer/copy path exists. | Planned constraint | PR #128. |
| SHARE-013 | Organizer-specific product side with separate Free and Pro value proposition. | Later | Issue #142. |
| SHARE-014 | Organizer Free starts with publishing Competition target setups that shooters can find and reuse. | Later / foundation partly implemented | Issue #142; template foundation exists. |
| SHARE-015 | Organizer Pro may grow into full tablet-based Competition workflow with live scoring. | Later | Issue #142. |
| SHARE-016 | Organizer live scoring needs roles, audit trail and safe correction workflows. | Later | Issue #142. |
| SHARE-017 | In Norway, organizer product should initially complement rather than try to replace Leirdue.net. | Later strategy | Issue #142. |
| SHARE-018 | In markets without a dominant national platform, organizer live scoring could have stronger standalone value. | Later strategy | Issue #142. |
| SHARE-019 | International organizer product may include configurable languages and Competition formats. | Later | Issue #142. |
| SHARE-020 | Organizer integrations and exports. | Later | Issue #142. |
| SHARE-021 | Public event pages and spectator views. | Later | Issue #142. |
| SHARE-022 | Organizer product could become a revenue stream separate from individual shooter subscriptions. | Later | Issue #142. |

---

# N. Shooting ground/location model

| ID | Idea / decision | Status | Historical source / note |
|---|---|---|---|
| GROUND-001 | Free-text shooting ground field on sessions/results. | Implemented | PR #23. |
| GROUND-002 | Analyze performance by shooting ground. | Implemented | PR #23 onward. |
| GROUND-003 | Personal canonical shooting grounds and aliases to merge spelling/import variants without changing anyone else’s data. | Implemented | PR #210. |
| GROUND-004 | Original source/imported ground text must remain preserved for auditability. | Implemented | PR #210/#212. |
| GROUND-005 | Reassign one session to a personal ground without broad automatic aliasing. | Implemented | PR #212. |
| GROUND-006 | User-controlled cleanup suggestions only; do not auto-merge venues. | Implemented | PR #210. |
| GROUND-007 | `Needs cleanup` concept for sessions with source ground text but no personal canonical assignment. | Planned | Performance cleanup discussion. |
| GROUND-008 | Canonical ground may later hold coordinates used for weather/location enrichment. | Planned | Weather roadmap. |

---

# O. Performance dashboard, statistics and focus areas

| ID | Idea / decision | Status | Historical source / note |
|---|---|---|---|
| PERF-001 | Competition performance percentage relative to winner. | Implemented | Early stats. |
| PERF-002 | Trend chart over time. | Implemented | Early stats. |
| PERF-003 | Adaptive chart scaling to make variation visible for high-performing shooters. | Implemented | PR #41. |
| PERF-004 | Recent, Best, Trend and Confidence top-level metrics. | Implemented | PR #215/#221. |
| PERF-005 | URL-backed discipline, period and Competition/Training filters. | Implemented | PR #215. |
| PERF-006 | Winner gap/context such as average, best and latest. | Implemented | PR #215/#221. |
| PERF-007 | Rolling average on Competition trend chart. | Implemented | Performance work. |
| PERF-008 | Performance should be a compact analysis dashboard, not a duplicate Results/Training history page. | Implemented principle | PR #221. |
| PERF-009 | Do not show large empty analysis cards when insufficient data exists. | Implemented / ongoing | PR #221. |
| PERF-010 | Do not misleadingly combine Training hit percentage with Competition winner-relative percentage. | Planned principle | Performance discussion. |
| PERF-011 | Shooting-ground comparison only when there is enough meaningful data. | Implemented baseline | PR #221. |
| PERF-012 | Ground drilldowns should stay compact and avoid unlimited inline history. | Implemented baseline | PR #221. |
| PERF-013 | Deterministic focus areas based on miss/target patterns. | Planned | Roadmap. |
| PERF-014 | Focus areas should use cautious labels and minimum sample sizes. | Planned | Roadmap/discussion. |
| PERF-015 | Performance by target type/presentation where enough structured data exists. | Planned | Roadmap. |
| PERF-016 | Performance by ground and target type for trap variants when source detail permits. | Planned | Roadmap. |
| PERF-017 | Better performance vs winning-score context across time and field strength. | Partly implemented | Coach Leirdue context; Performance still evolving. |
| PERF-018 | Use placement, median/top group and field strength where available instead of only winner=100%. | Partly implemented | Coach Report V2. |
| PERF-019 | Competition level/context classifier (local/regional/national/unknown) for report interpretation. | Implemented in Coach evidence | PR #194. |
| PERF-020 | Recent form should be compact rather than a full result list. | Implemented | PR #221. |
| PERF-021 | Training volume should be compact and relevant, not a general activity tracker. | Implemented baseline | PR #221. |
| PERF-022 | Discipline-specific visuals: Skeet stand map, Trap station view, Sporting/Compak-specific representations. | Planned | User discussion / discipline visuals roadmap. |

---

# P. Performance Report, Coach Report and coaching ecosystem

| ID | Idea / decision | Status | Historical source / note |
|---|---|---|---|
| REPORT-001 | Shooter-facing Performance Report distinct from external Coach Report. | Planned | Product discussion July 2026. |
| REPORT-002 | App should deliver useful performance value even for a shooter with no real coach. | Planned principle | Product discussion. |
| REPORT-003 | Performance Report comes before full coach collaboration features. | Planned | Locked roadmap decision. |
| REPORT-004 | Select report period by date range or last X sessions/competitions. | Implemented foundation / planned Performance version | Coach Report flow. |
| REPORT-005 | Separate Competition and Training sections. | Implemented foundation | Coach Report. |
| REPORT-006 | Combined synthesis is allowed only when metrics are not mixed misleadingly. | Planned principle | Report architecture. |
| REPORT-007 | Report should identify one clear main priority for the next training period. | Planned | Performance Report roadmap. |
| REPORT-008 | Report should surface strengths, weaknesses and change over time. | Planned | Performance Report roadmap. |
| REPORT-009 | Show sample size/data quality/confidence. | Partly implemented | Coach Report evidence. |
| REPORT-010 | Findings should be traceable back to underlying sessions/evidence. | Planned / partial | Evidence engine. |
| REPORT-011 | Deterministic evidence packet before AI generation. | Implemented | PR #193/#194. |
| REPORT-012 | Coach Report uses Competition/Training grouping, score trends, repeated miss patterns, phase patterns and preparation context. | Implemented foundation | PR #193. |
| REPORT-013 | Start/middle/finish miss distribution. | Implemented | Coach evidence engine. |
| REPORT-014 | Training-before-Competition lookback. | Implemented | Coach evidence engine. |
| REPORT-015 | Leirdue field-strength comparison and placement context. | Implemented foundation | PR #194. |
| REPORT-016 | AI-generated coach summary from privacy-safe deterministic evidence. | Implemented | PR #194. |
| REPORT-017 | Preview report before copying/sharing. | Implemented | PR #192 onward. |
| REPORT-018 | Later `Send report to coach` flow. | Planned | Roadmap. |
| REPORT-019 | Later coach accounts with explicit permissions. | Later | Roadmap. |
| REPORT-020 | Coach comments/feedback on reports or sessions. | Later | Roadmap. |
| REPORT-021 | Shared goals/training priorities between shooter and coach. | Later | Roadmap. |
| REPORT-022 | Curated/listed paid coaches may later be recommended clearly as paid coaching options. | Later / needs review | Conversation, 16 July 2026. |
| REPORT-023 | Possible broader coach marketplace/network, but not an early core feature. | Parked / needs review | Historical discussion; keep separate from direct coach sharing. |

---

# Q. AI-native features and assistants

| ID | Idea / decision | Status | Historical source / note |
|---|---|---|---|
| AI-001 | AI synthesis over structured performance evidence. | Implemented foundation | Coach Report AI. |
| AI-002 | AI Shooting Assistant Chat answering questions about the user’s own shooting data. | Planned | Dedicated roadmap. |
| AI-003 | Shooting Assistant can answer practical clay-shooting questions in addition to personal data questions, with appropriate grounding/limitations. | Planned | Dedicated roadmap. |
| AI-004 | AI App Copilot that can create sessions, find data, prepare reports and help configure the app from natural language. | Planned | Dedicated roadmap. |
| AI-005 | Copilot can use text and eventually voice. | Planned | Roadmap. |
| AI-006 | Important Copilot writes/changes must show a preview and require confirmation. | Planned locked principle | Roadmap. |
| AI-007 | Multimodal AI for scorecards and target/post signs. | Implemented foundation | Existing photo import. |
| AI-008 | AI can suggest what the shooter should log more of to improve future analysis. | Later | AI-native strategy. |
| AI-009 | Tips linked to actual miss patterns rather than generic random advice. | Planned | Learning idea. |
| AI-010 | Link relevant Ed Solomons videos or other approved learning resources to identified patterns. | Later | User idea. |
| AI-011 | AI must distinguish observed facts, statistical association, shooter assumption and AI hypothesis. | Planned principle | Weather/AI/report strategy. |
| AI-012 | Paid/cost-sensitive AI calls must be entitlement-gated server-side. | Implemented foundation | PR #214. |
| AI-013 | Closed beta users should not see AI paywalls while beta billing is hidden. | Implemented foundation | PR #214. |
| AI-014 | AI rules assistant grounded in official discipline rulebooks. | Later | Issue #139; separate from personal Shooting Assistant. |

---

# R. Equipment, weapons, choke and ammunition

| ID | Idea / decision | Status | Historical source / note |
|---|---|---|---|
| EQUIP-001 | Personal Equipment profile for weapons, chokes and ammunition. | Implemented | PR #95. |
| EQUIP-002 | Weapon types and per-weapon choke inventory. | Implemented | PR #95. |
| EQUIP-003 | Fixed-choke and interchangeable-choke support. | Implemented | PR #95. |
| EQUIP-004 | Current choke assignment per relevant barrel/slot. | Implemented | PR #95. |
| EQUIP-005 | Default weapon and default ammunition profile. | Implemented | PR #95. |
| EQUIP-006 | Optional equipment selector when logging personal Competition/Training results. | Implemented | PR #98. |
| EQUIP-007 | Immutable equipment snapshot so historical logs do not change when equipment records are edited/deleted. | Implemented | PR #98. |
| EQUIP-008 | Equipment remains optional and should not slow quick-result workflows. | Implemented principle | PR #98 / roadmap. |
| EQUIP-009 | Custom friendly display name for guns/barrel setups. | Implemented | Simon feedback / PR #197. |
| EQUIP-010 | Keep manufacturer/model/gauge structured even when a custom display name is used. | Implemented | Simon feedback. |
| EQUIP-011 | Optionally identify barrel length/barrel set so identical models can be distinguished. | Partly implemented / needs review | Simon feedback; display name exists, structured barrel-set detail may not. |
| EQUIP-012 | Tag weapon used per session or round. | Partly implemented | Session snapshot exists; round-level not yet. |
| EQUIP-013 | Compare a test weapon against the shooter’s usual/default weapon. | Planned | Simon weapon-testing context. |
| EQUIP-014 | Separate Training and Competition when comparing weapons. | Planned | Weapon comparison principle. |
| EQUIP-015 | Show session/target sample size and warn about small samples. | Planned | Weapon comparison principle. |
| EQUIP-016 | Warn when apparent equipment differences may reflect different target/Competition difficulty. | Planned | Weapon comparison principle. |
| EQUIP-017 | Do not claim one weapon is objectively better without sufficient evidence. | Planned constraint | Roadmap. |
| EQUIP-018 | One Competition may use multiple ammunition types. | Planned | User decision, July 2026. |
| EQUIP-019 | Chokes may change during a Competition. | Planned | User decision, July 2026. |
| EQUIP-020 | Store choke separately for each barrel where relevant. | Planned | User decision. |
| EQUIP-021 | Allow different ammunition for first and second shot. | Planned | User decision. |
| EQUIP-022 | Equipment timeline with a default setup and `Change equipment from here` at a post/stand/round. | Planned | User decision. |
| EQUIP-023 | An equipment change remains active until another change event. | Planned | User decision. |
| EQUIP-024 | Same timeline architecture later supports changing weapon mid-event. | Later | User decision. |
| EQUIP-025 | Analysis must attribute only the segment actually shot with a given choke/ammo setup, not the whole Competition. | Planned | User decision. |
| EQUIP-026 | Choke/ammo recommendation based on distance, angle, visible target area, speed, target type and shot order. | Later | Choke selector roadmap. |
| EQUIP-027 | Recommend different chokes per barrel where appropriate. | Later | Choke selector roadmap. |
| EQUIP-028 | Pattern-test/mønstring data may later inform choke/ammunition advice. | Later | Choke selector roadmap. |
| EQUIP-029 | Choke/ammo recommendations must explain uncertainty and never guarantee a hit. | Later constraint | Choke selector roadmap. |
| EQUIP-030 | Optional weapon `Last serviced` date, visible and editable in Equipment without affecting logging snapshots. | Implemented | Issue #224; first weapon-maintenance field only. |

---

# S. Weather and environmental context

| ID | Idea / decision | Status | Historical source / note |
|---|---|---|---|
| WEATHER-001 | Optional weather snapshot on Competition/Training sessions. | Planned | Weather roadmap. |
| WEATHER-002 | Automatically obtain weather from shooting-ground location and session time when available. | Planned | Weather roadmap. |
| WEATHER-003 | Store temperature. | Planned | Weather roadmap. |
| WEATHER-004 | Store wind speed. | Planned | Weather roadmap. |
| WEATHER-005 | Store wind gusts. | Planned | Weather roadmap. |
| WEATHER-006 | Store wind direction. | Planned | Weather roadmap. |
| WEATHER-007 | Store rain/precipitation state. | Planned | Weather roadmap. |
| WEATHER-008 | Store humidity, pressure, cloud cover and visibility where provider data supports it. | Planned | Weather roadmap. |
| WEATHER-009 | Store weather provenance/source and whether data was automatic or manual. | Planned | Weather roadmap. |
| WEATHER-010 | Weather is optional and must never block session logging. | Planned constraint | Weather roadmap. |
| WEATHER-011 | Offline session can retain time/location and enrich weather later when connected. | Planned | Weather roadmap. |
| WEATHER-012 | Historical weather backfill for old sessions when location/time accuracy is sufficient. | Planned | Weather roadmap. |
| WEATHER-013 | Do not pretend a daily weather value is exact session weather when time is unknown. | Planned constraint | Weather roadmap. |
| WEATHER-014 | Long events may need multiple time-varying weather snapshots. | Later | Weather roadmap. |
| WEATHER-015 | Optionally associate weather snapshots with round/course/post time ranges. | Later | Weather roadmap. |
| WEATHER-016 | Resolve shooting-ground coordinates as preferred location source. | Planned | Weather roadmap. |
| WEATHER-017 | Device location only with explicit permission; GPS is never mandatory. | Planned constraint | Weather roadmap. |
| WEATHER-018 | Target-relative wind context only when target direction/ground geometry is actually known. | Later | Weather roadmap. |
| WEATHER-019 | Analyze performance correlations in strong wind, rain or changing conditions with sample-size warnings. | Later | Weather roadmap. |
| WEATHER-020 | Never state weather caused misses merely from correlation. | Planned constraint | Weather roadmap. |
| WEATHER-021 | Weather can inform shooting-glasses and equipment context later. | Later | Weather roadmap. |
| WEATHER-022 | Optional forecast/preparation reminders for planned sessions. | Later | Weather roadmap. |

---

# T. Shooter profile and identity

| ID | Idea / decision | Status | Historical source / note |
|---|---|---|---|
| PROFILE-001 | Shooter profile with canonical identity. | Implemented | Profile foundation. |
| PROFILE-002 | Separate required first and last name while preserving legacy combined name compatibility. | Implemented | Issue #146 / PR #147. |
| PROFILE-003 | Country in profile. | Implemented | Profile foundation. |
| PROFILE-004 | Selected/main disciplines in profile. | Implemented | Profile foundation. |
| PROFILE-005 | Discipline choices can personalize defaults and import suggestions. | Planned / partial | Roadmap. |
| PROFILE-006 | Name aliases for import/matching. | Planned | Leirdue/shared training roadmap. |
| PROFILE-007 | Default gun/barrel setup. | Partly implemented | Equipment default exists. |
| PROFILE-008 | Default ammunition. | Implemented foundation | Equipment. |
| PROFILE-009 | Default/owned shooting lenses. | Later | Shooting-glasses roadmap. |
| PROFILE-010 | Optional metadata should remain collapsed and not make onboarding heavy. | Planned principle | Roadmap. |
| PROFILE-011 | Country/profile context can aid participant matching but must not be treated as citizenship/event eligibility. | Planned constraint | Shared training + issue #152. |

---

# U. Shooting glasses / lens support

| ID | Idea / decision | Status | Historical source / note |
|---|---|---|---|
| GLASS-001 | Register shooting glasses/lenses the shooter actually owns. | Later | Shooting-glasses roadmap. |
| GLASS-002 | Recommend among the user’s own lenses rather than acting as an undisclosed shopping recommender. | Later | Shooting-glasses roadmap. |
| GLASS-003 | Use light/weather/camera context where reliable. | Later | Shooting-glasses roadmap. |
| GLASS-004 | Explain uncertainty in lens recommendations. | Later | Shooting-glasses roadmap. |
| GLASS-005 | Avoid hidden commercial purchase recommendations. | Later constraint | Shooting-glasses roadmap. |

---

# V. Mental performance and personal context

| ID | Idea / decision | Status | Historical source / note |
|---|---|---|---|
| MENTAL-001 | Optional shooting-specific mental-performance tracking, not therapy. | Later | Mental performance roadmap. |
| MENTAL-002 | Pre-session check-in: energy. | Later | Mental roadmap. |
| MENTAL-003 | Pre-session check-in: focus. | Later | Mental roadmap. |
| MENTAL-004 | Pre-session check-in: nerves/pressure. | Later | Mental roadmap. |
| MENTAL-005 | Pre-session check-in: confidence. | Later | Mental roadmap. |
| MENTAL-006 | Pre-session main intention. | Later | Mental roadmap. |
| MENTAL-007 | Post-session mental-performance reflection. | Later | Mental roadmap. |
| MENTAL-008 | Track pressure handling. | Later | Mental roadmap. |
| MENTAL-009 | Track routine consistency. | Later | Mental roadmap. |
| MENTAL-010 | Track ability to reset after a miss. | Later | Mental roadmap. |
| MENTAL-011 | Record what worked / what to improve. | Later | Mental roadmap. |
| MENTAL-012 | Optional miss tags: rushed shot, no clear plan, lost focus, overthinking, hesitation, pressure/nerves, frustration after previous miss, fatigue, unknown. | Later | Mental roadmap. |
| MENTAL-013 | Analyze mental patterns cautiously without claiming causal certainty. | Later constraint | Mental roadmap. |
| MENTAL-014 | Provide practical reset-after-miss and Competition-preparation routines later. | Later | Mental roadmap. |
| NOTE-001 | Private whole-session personal notes. | Implemented | Issue #156 / PR #187. |
| NOTE-002 | Private per-post/stand personal notes. | Implemented | Issue #156 / PR #187. |
| NOTE-003 | Personal notes must remain separate from shared organizer instructions. | Implemented principle | Issue #156. |
| NOTE-004 | Private notes can optionally contribute summarized context to private analysis/reporting. | Implemented foundation | PR #189. |
| NOTE-005 | Never send raw private note text to analytics. | Implemented | Private notes/analytics guardrail. |

---

# W. Notifications and reminders

| ID | Idea / decision | Status | Historical source / note |
|---|---|---|---|
| NOTIF-001 | In-app notification center / bell. | Planned | July 2026 discussion. |
| NOTIF-002 | Unread notification state/count. | Planned | July 2026 discussion. |
| NOTIF-003 | Web Push subscription per device for installed PWA/browser. | Planned | July 2026 discussion. |
| NOTIF-004 | Admin push when a new beta access request arrives. | Planned | July 2026 discussion. |
| NOTIF-005 | Admin push when new beta feedback arrives. | Planned | July 2026 discussion. |
| NOTIF-006 | Tapping a notification should deep-link to the relevant admin/app screen. | Planned | July 2026 discussion. |
| NOTIF-007 | App badge on supported platforms. | Planned | July 2026 discussion. |
| NOTIF-008 | Notify user when added to shared Training Score Sheet. | Planned | Shared training. |
| NOTIF-009 | Notify user when a result is ready to claim/review. | Planned | Shared training. |
| NOTIF-010 | Coach/collaboration event notifications later. | Later | Coaching roadmap. |
| NOTIF-011 | User-defined training/reminder notifications. | Later | July discussion. |
| NOTIF-012 | Notify about an important unfinished action only when the user would reasonably expect follow-up. | Later | Notification principle. |
| NOTIF-013 | Avoid generic nagging engagement notifications such as unsolicited `You have not trained for 7 days`. | Planned constraint | July discussion. |
| NOTIF-014 | Push must be opt-in. | Planned constraint | Roadmap. |

---

# X. PWA, installation and brand asset experience

| ID | Idea / decision | Status | Historical source / note |
|---|---|---|---|
| PWA-001 | Installable Progressive Web App with standalone launch. | Implemented | PR #218. |
| PWA-002 | Manifest, safe-area support and service worker foundation. | Implemented | PR #218. |
| PWA-003 | Minimal offline fallback without caching authenticated API/Supabase data indiscriminately. | Implemented | PR #218. |
| PWA-004 | Explicit `Install app` in global menu. | Implemented | PR #219. |
| PWA-005 | Native Android install prompt when browser supports it. | Implemented | PR #219. |
| PWA-006 | Clear iPhone Safari Add-to-Home-Screen instructions including `Open as Web App`. | Implemented | PR #219. |
| PWA-007 | Dismissing promotional install hint must not remove explicit Install action. | Implemented | PR #219. |
| PWA-008 | Current generated CP/LAB icon is temporary. | Stabilizing | User feedback. |
| PWA-009 | Final app icon should use actual CPL gold monogram/clay logo without long text. | Planned | User logo decision. |
| PWA-010 | Account for iOS/PWA icon caching and home-screen reinstall/update behavior. | Planned | Icon implementation note. |
| PWA-011 | Native App Store wrapper should be considered only if PWA constraints create a real product need. | Later | Product roadmap. |

---

# Y. Beta, feedback, analytics and product operations

| ID | Idea / decision | Status | Historical source / note |
|---|---|---|---|
| BETA-001 | Closed beta with explicit approval rather than open access. | Implemented | Beta foundation. |
| BETA-002 | Public `Join the closed beta` interest/waitlist form. | Implemented | PR #199. |
| BETA-003 | Beta admin approval inbox that combines interest submission and account state. | Implemented | PR #207/#209. |
| BETA-004 | Approval emails sent server-side with delivery diagnostics. | Implemented | PR #200/#205. |
| BETA-005 | In-app beta feedback rather than mailto. | Implemented | PR #200. |
| BETA-006 | Feedback can include private screenshot attachments. | Implemented | PR #202. |
| BETA-007 | Dedicated admin feedback inbox with reviewed/resolved/archive workflow. | Implemented | PR #203/#204. |
| BETA-008 | Preserve source page/context when feedback is submitted. | Implemented | PR #203. |
| BETA-009 | Small first-party privacy-conscious product analytics foundation. | Implemented | Issue #166 / PR #184. |
| BETA-010 | No advertising/tracking cookies for product analytics. | Implemented principle | Issue #166. |
| BETA-011 | Aggregate analytics by default. | Implemented principle | Issue #166. |
| BETA-012 | Authenticated user-level usage analytics only for legitimate product/operational purposes. | Implemented principle | Issue #166. |
| BETA-013 | Never collect scorecard images, target-sign images, raw private notes, IP addresses or raw user agents in analytics without explicit future justification. | Implemented principle | Issue #166 / analytics sanitizer. |
| BETA-014 | Admin analytics for 7/30/90-day traffic and feature usage. | Partly implemented | Current MVP has key windows; exact future presentation can evolve. |
| BETA-015 | Aggregated view of most active authenticated users by product usage, not click replay/session recording. | Needs review | Issue #166. |
| BETA-016 | Controlled closed-beta growth before broad launch. | Implemented strategy | Launch discussions. |
| BETA-017 | Social/Instagram presence can support beta interest, but product should not overpromise before core flows are stable. | Planned strategy | Beta/social discussion. |

---

# Z. Free, Pro, roles and commercialization

| ID | Idea / decision | Status | Historical source / note |
|---|---|---|---|
| MON-001 | Hidden Free/Pro entitlement foundation before visible billing. | Implemented | PR #214. |
| MON-002 | Closed beta shows no prices, checkout, paywalls or upgrade prompts. | Implemented | Billing mode foundation. |
| MON-003 | Approved beta/admin users effectively receive Pro-like access while billing is hidden. | Implemented principle | PR #214. |
| MON-004 | Free tier focuses on basic logging, basic stats and limited history/import. | Planned | `FREE_VS_PRO.md`. |
| MON-005 | Pro tier focuses on advanced analysis, AI, Coach workflows, packaged reports and more history. | Planned | `FREE_VS_PRO.md`. |
| MON-006 | Do not launch payment before onboarding, import and logging are stable. | Planned constraint | Product roadmap. |
| MON-007 | Product tier and data-access role are separate concepts. | Planned principle | Roles roadmap. |
| ROLE-001 | Shooter role. | Planned formalization | Access roadmap. |
| ROLE-002 | Coach role with explicit permission to access only shared/authorized data. | Later | Access roadmap. |
| ROLE-003 | Organizer role. | Later | Organizer/access roadmap. |
| ROLE-004 | Shooting-ground organization role. | Later | Access roadmap. |
| ROLE-005 | Pro subscription must never automatically grant access to another person’s private data. | Planned locked principle | Access roadmap. |
| MON-008 | Social feed, trophies and leaderboards are not early launch blockers. | Parked | Launch roadmap. |
| MON-009 | Full club premium product is not an early launch blocker. | Parked | Launch roadmap. |
| MON-010 | Organizer product may later have its own Free/Pro monetization separate from shooter Pro. | Later | Issue #142. |

---

# AA. Media, ShotKam and richer evidence

| ID | Idea / decision | Status | Historical source / note |
|---|---|---|---|
| MEDIA-001 | Attach optional target/presentation reference photos. | Later | Product roadmap. |
| MEDIA-002 | Attach or link video to a session/target/miss. | Later | Product roadmap. |
| MEDIA-003 | ShotKam video linked to specific target/miss. | Later | Product roadmap. |
| MEDIA-004 | Device screenshots from other systems may be optional evidence. | Later | Product discussion. |
| MEDIA-005 | AI may interpret media as additional evidence, but review and confidence remain explicit. | Later | AI-native strategy. |
| MEDIA-006 | Compare visually similar presentations later. | Later | Product roadmap. |

---

# AB. Learning, training priorities and planning

| ID | Idea / decision | Status | Historical source / note |
|---|---|---|---|
| LEARN-001 | Show practical tips when repeated miss patterns are strong enough. | Planned | User idea. |
| LEARN-002 | Example: repeated crosser misses can surface a crosser-focused tip. | Planned | User example. |
| LEARN-003 | Link to an appropriate Ed Solomons video or other approved learning content when relevant. | Later | User idea. |
| LEARN-004 | Personal training priorities derived from actual logged patterns. | Planned | Core product goal. |
| LEARN-005 | Suggested drills/session structure based on weaknesses. | Later | AI/learning roadmap. |
| LEARN-006 | Planned training sessions based on earlier patterns. | Later | Early roadmap idea. |
| LEARN-007 | Tips should help learners without cluttering the product for advanced shooters who do not need generic instruction. | Planned principle | User discussion. |

---

# AC. Team, club and group-performance ideas

| ID | Idea / decision | Status | Historical source / note |
|---|---|---|---|
| TEAM-001 | Three-shooter club team selector for events such as NM team competition. | Needs review | Issue #152. |
| TEAM-002 | Recommend strongest eligible three-shooter combination from a user-supplied candidate pool. | Needs review | Issue #152. |
| TEAM-003 | Eligibility must be event-specific/user-controlled; do not infer eligibility from country profile. | Needs review constraint | Issue #152. |
| TEAM-004 | Recommendation should be transparent and explain the data/criteria rather than act as a black box. | Needs review | Issue #152. |

---

# AD. Data export, provenance and privacy

| ID | Idea / decision | Status | Historical source / note |
|---|---|---|---|
| DATA-001 | `Export my data`. | Implemented | Existing app. |
| DATA-002 | Export should include meaningful session/result/miss detail while preserving correct pair miss counts. | Implemented | Export evolution / PR #87. |
| DATA-003 | Keep imported source URL/system so users can trace data back to the original source. | Implemented / planned expansion | Leirdue and ClayArena direction. |
| DATA-004 | Preserve immutable historical equipment snapshot even if live equipment records change. | Implemented | PR #98. |
| DATA-005 | Preserve original shooting-ground source text even after personal canonical grouping. | Implemented | PR #210. |
| DATA-006 | Raw private notes and generated report bodies should not be sent to analytics. | Implemented | Report/privacy guardrails. |
| DATA-007 | Shared setup/template payloads contain only setup data, never private performance data. | Implemented | PR #128. |

---

# AE. Historical / superseded workflow concepts kept for completeness

| ID | Idea / decision | Status | Historical source / note |
|---|---|---|---|
| HIST-001 | Early dashboard grouped Competition, Training and Result-only session lists directly. | Superseded / evolved | PR #7 and later dashboard redesigns. |
| HIST-002 | Early dashboard primary action `New shooting log`. | Superseded | Later split into clearer Log Competition / Log Training. |
| HIST-003 | FITASC Schemes as a primary dashboard card. | Superseded in current navigation | Early user constraint / later moved to menu/support. |
| HIST-004 | Dedicated quick Competition score route with per-course metadata serialized in notes. | Implemented historically; may be subsumed by broader Competition depth model | PR #90. |
| HIST-005 | Large Competition activity card on Performance. | Superseded presentation | Value retained elsewhere; removed from Performance in PR #221. |
| HIST-006 | Email/mailto beta feedback. | Superseded | Replaced by in-app feedback. |
| HIST-007 | Beta/tester notes and `Report issue` buttons embedded throughout Training Score Sheet. | Superseded | Removed after dedicated feedback system. |
| HIST-008 | Appearance control inside Shooter Profile. | Superseded | Moved to Settings. |
| HIST-009 | Multiple parallel top-navigation/menu systems. | Superseded | Replaced by global menu. |
| HIST-010 | Long automatic Leirdue crawling from one frontend request. | Superseded | Replaced by cache + bounded continuation + scheduled refresh. |
| HIST-011 | Assuming a fixed target count for every post in post-based disciplines. | Superseded | Variable per-post counts implemented. |
| HIST-012 | Requiring Competition setup before scorecard import. | Superseded | Zero-setup structure discovery implemented. |
| HIST-013 | Treating every occurrence of the same physical clay as a separate full target definition. | Superseded | Shared physical-target model. |
| HIST-014 | Using one fixed weapon/ammunition/choke snapshot to describe an entire Competition when setup may change mid-event. | Superseded as future data-model assumption | Equipment timeline decision. |

---

# Review process

The next step is **not** to build all of this.

We should review the register category by category and mark each idea:

1. **Keep as-is**
2. **Change**
3. **Merge with another idea**
4. **Move up in priority**
5. **Move to later**
6. **Park / reject**

During review, do not delete historical entries. Update status and add a note explaining the decision.

Recommended review order:

1. Product principles and core logging
2. Competition + scorecard import
3. Training + shared training + offline
4. Disciplines
5. Target definitions and shared setups
6. Performance + reports + AI
7. Equipment + weather + mental context
8. Notifications + PWA
9. Organizer/roles/monetization
10. Longer-term ideas such as media, glasses, coach marketplace and team selector

---

# Newly recovered during this audit that were at risk of being lost

The audit explicitly recovered several ideas that were absent or too vague in the rewritten master roadmap:

- official rules links page
- AI rules assistant grounded in official rulebooks
- organizer-specific Free/Pro product and tablet live Competition scoring
- public event/spectator views for an organizer product
- three-shooter club team selector
- English Skeet as the first requested skeet variant
- shared configuration-driven skeet engine for multiple distinct variants
- exact rule-set/version preservation for skeet and other disciplines
- Competition activity summary as a product feature even after removing it from Performance
- old shared-template matching details including exact-date weighting and ±1-day matching
- current exclusion of scorecard/Leirdue flows from automatic shared-template suggestions
- FITASC stand-view/fullscreen/swipe concepts from stale historical PRs
- official-rules utility as a separate concept from the AI Shooting Assistant
- broader paid-coach listing/marketplace concept
- organizer roles, audit trail, corrections, integrations, exports and spectator views
- local-first private notes and the broader need to consolidate local/offline queues

These entries now remain in this append-only register even if they are later deprioritized.


## 19 July 2026 addendum – issue #222 / #224

| ID | Idea / decision | Status | Historical source / note |
|---|---|---|---|
| PERF-222 | Restore Performance depth with progressive disclosure after the over-aggressive PR #221 cleanup. Keep a simple overview at the top, then add compact Activity & Form, breakdowns and collapsed deeper data. | Next / in progress | Issue #222. |
| EQUIP-224 | Add optional weapon `Last serviced` date, editable from Equipment only. Do not put service tracking into quick Competition/Training logging; full service history/reminders remain later. | Implemented first field | Issue #224. |
