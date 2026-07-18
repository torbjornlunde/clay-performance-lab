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
