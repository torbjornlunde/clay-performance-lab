# Clay Performance Lab repository instructions

These instructions apply to the entire repository unless a more specific `AGENTS.md` exists in a subdirectory.

## Working method

- Start from the latest `main` unless the task explicitly says to continue an existing branch or PR.
- When correcting an existing PR, continue on its current branch. Do not create a competing PR.
- Keep every PR narrowly focused on the requested task.
- Inspect the existing implementation, schema and migrations before changing anything.
- Prefer the smallest complete fix over a broad refactor.
- Reuse existing components, utilities and project conventions where practical.
- Do not merge the PR. Leave it ready for review and field testing.

## Product rules

- Use English UI text only.
- Build mobile-first. The app is used outdoors on phones during live clay shooting.
- Prevent horizontal overflow and unstable page movement.
- Mobile form controls should have comfortable touch targets and an effective font size of at least 16px to avoid unwanted iPhone zoom.
- Keep common actions fast and obvious. Do not hide a core live-use action far down the page.
- Keep Basic/Quick flows lightweight. Advanced analysis and setup must not add friction to simple logging.
- Preserve the existing Dashboard Menu unless the task specifically concerns it.
- Do not introduce payments, subscriptions, service history, analytics or unrelated integrations unless explicitly requested.

## Data and Supabase

- Preserve all existing user data and existing routes.
- Treat already-applied migrations as immutable.
- Database changes must use a new additive, timestamped migration in `supabase/migrations`.
- Do not edit an old migration as though it has not already run.
- Enable appropriate RLS for user-facing tables in the exposed `public` schema.
- Never expose the service-role key to client code. Service-role operations must remain server-side.
- Avoid automatic writes to another user's data. Use explicit confirmation for claims, imports and sharing.
- When historical records depend on mutable profile data, store a snapshot rather than only a live foreign-key reference.
- If SQL is required, include the complete SQL and migration filename in the final summary. State clearly whether manual Supabase action is required.

## UI and interaction quality

- Test the actual interaction, not only the initial render.
- Sheets, modals and selectors must open inside the visible viewport and work on iPhone-sized screens.
- Do not disable browser pinch zoom or use `user-scalable=no`.
- Keep input focus stable while typing. Components must not remount or steal focus on each keystroke.
- Long searchable option lists should use a consistent responsive selector; short fixed lists may use a clear native select.
- Show loading, success and error states. Do not silently fail.
- Destructive actions require clear confirmation.

## Testing

Use the quickest useful check while iterating, then run the full production build once before completion:

- `npm run typecheck` during implementation
- `npm run build` before reporting completion
- `npm run check:score-sheet-safety` when Training Score Sheet code is affected
- mobile widths around 320px, 375px, 390px and 430px for UI work
- desktop layout for regressions

Do not repeatedly run the full build after every small edit unless the task requires it.

Where the environment cannot run a check, say so explicitly. Never claim a test passed unless it was actually run.

## Completion summary

Every completed task should report:

- branch and PR used
- commits added
- files changed
- user-visible behavior changed
- database fields and migration filename, if any
- complete SQL and whether it must be run manually, if any
- tests actually run and their results
- known limitations or unverified device behavior
- confirmation that unrelated features were not added
- confirmation that the PR was not merged
