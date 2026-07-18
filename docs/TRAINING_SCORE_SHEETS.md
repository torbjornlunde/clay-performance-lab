# Training Score Sheets

Training Score Sheets now support live target-by-target scoring for organizer-led training rounds.

## Current scoring model

- One organizer can score multiple shooters in the same Training Score Sheet.
- Each shooter, post or station, and target position can be stored as `hit`, `miss`, or empty/not scored.
- For newly detailed score sheets, target-level results are the source of truth.
- Post totals, shooter totals, scored target counts, misses, and percentages are calculated from target-level results.
- Legacy total-only score sheets remain supported. Existing manual post totals continue to load and display when no target-level results exist for that shooter and post.
- The live scorecard keeps Training separate from Competition and does not add AI, payments, participant claiming, notifications, coach permissions, or visible Pro gating.

## Live organizer workflow

- Field Mode is mobile-first for use on phones during a live round.
- The default non-Compak live scorecard shows one post at a time with all shooters visible.
- Each target cell is a large touch target.
- Tapping a target cycles through `Hit → Miss → Clear`, allowing fast scoring and correction without modals.
- Organizers can move to the previous or next post and can also select a post directly.
- The scorecard shows whether the active post is complete or how many target entries remain.
- Local draft autosave and sync status messages protect active scoring when connectivity is unreliable.

## Storage and compatibility

Target results are stored in `training_score_sheet_target_results` using the existing Training Score Sheet shooter/participant rows. The stable unique key is:

- `score_sheet_id`
- `shooter_id`
- `post_number`
- `target_number`

This keeps upserts duplicate-safe and leaves room to link the existing shooter/participant row to a user in a future participant-claiming workflow.

## Future work that remains out of scope

- Structured target definitions such as distance, speed, angle, difficulty, and detailed target descriptions.
- Participant claiming, global shooter matching, notifications, and coach permissions.
- Rich personal miss analysis during or after a round.
- Broader app-wide offline architecture beyond the active Training Score Sheet local draft and retry behavior.
