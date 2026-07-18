# Scorecard photo import

Scorecard image import is review-first. The app may use server-side AI/vision to interpret a photographed paper scorecard, but interpreted values are never written directly to final user data without the user reviewing and confirming them.

The structured interpretation can include variable post or station geometry. In addition to metadata such as session type, discipline, shooter name, date, shooting ground, total targets and total score, the parser records each post with its own `expectedTargets` value and target-level results when visible. This supports paper grids where grey, blocked or otherwise inactive cells mean that the target position does not exist for that post.

For Sokna-style training cards, a synthetic deterministic fixture represents 16 posts with `expected_targets_by_post = [8,8,8,8,8,8,8,6,8,8,6,8,6,6,8,8]` for 120 total targets. Inactive cells are excluded from the expected target count; they are not imported as misses and are not shown as blank active targets.

Target-level results are confidence-aware:

- clear hit marks can map to hit;
- clear miss marks can map to miss;
- blank active cells and ambiguous handwriting remain uncertain until review;
- unavailable cells are inactive and are not rendered as targets;
- raw OCR or extraction text is diagnostic only and is not authoritative user data.

When a post total such as `7/8` is readable but exact hit/miss target positions are not reliable, the import keeps that post as total-only. It does not fabricate seven hits and one arbitrary miss. A reviewed import may temporarily mix detailed posts with total-only posts.

Training imports with reviewed target-level structure map to Training Score Sheets using `expected_targets_by_post`, post scores and target results. Confirmed hit/miss cells become target results; uncertain or unscored cells remain empty until the user resolves them. Post totals for detailed posts are calculated from confirmed target results.

Competition scorecard import keeps the existing competition/session apply path. Reusing the interpreted structure for dedicated Competition live scoring remains a separate follow-up, not part of this import upgrade.

The required flow remains:

1. upload image;
2. interpret;
3. review structure;
4. review score cells;
5. confirm;
6. save.

AI/vision calls must remain behind the existing server-side entitlement and paid-cost protection architecture. Closed-beta users approved in `beta_hidden` mode should not see a Pro paywall.

## Structure discovery mode

The image analyzer supports two safe modes:

- **Known setup mode** uses an existing competition/session setup as a constraint when post count and targets per post are already defined.
- **Structure discovery mode** is used when the user only knows minimal metadata, such as Training and an expected total target count. In this mode the photo interpretation derives post count, per-post target counts and inactive cells from the printed card, then validates the detected total against the optional expected total.

A minimal Training import can start from session type, optional discipline and expected total targets. After review and confirmation, the reviewed interpretation creates a Training Score Sheet and navigates to its detail page. Competition imports continue to use the existing session-based import path.

## Zero-setup Competition discovery import

For supported post-based Competition disciplines, an empty Competition setup no longer blocks scorecard photo capture. The import page explains that post structure will be detected from the scorecard, then lets the shooter take a photo or choose one from the library.

Discovery mode is only used when the Competition has no usable saved structural setup: no `session_post_targets`, no `post_count`, no `course_count` and no `targets_per_post`. A saved `total_targets` value alone is allowed and acts as a validation constraint during apply. Existing valid or partial structural setups remain known/conflict imports and keep setup fingerprint protection. If a setup is created or changed after discovery analysis but before apply, apply returns a safe conflict and the user must re-analyze/review instead of silently overwriting that setup.

During final apply, the server derives the saved structure from the current reviewed grid, not from stale AI detections. Variable post target counts are persisted through `session_post_targets` using structural placeholder rows only: `post_number`, `target_position`, `presentation_number = target_position`, `presentation_type = 'unknown'` and `position_in_presentation = 1`. The photo import does not invent target direction, speed, distance, presentation type, labels, target type, difficulty, notes, or clay descriptions; downstream miss matching treats `presentation_type = 'unknown'` as ambiguous rather than as a real pair/single presentation.

Migration required before merge: `supabase/migrations/20260718010000_scorecard_import_discovery_apply.sql` updates `public.apply_scorecard_import_v2` with an explicit atomic discovery mode that saves the Competition structure, reviewed score, and reviewed miss positions in one transaction.
