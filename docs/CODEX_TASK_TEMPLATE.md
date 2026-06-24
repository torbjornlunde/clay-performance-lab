# Compact Codex task template

Use this template for new Codex tasks. Repository-wide rules already live in `AGENTS.md`, so prompts should contain only task-specific information.

```text
Follow AGENTS.md.

Task:
[One sentence describing the requested outcome.]

Branch / PR:
- Start from latest main.
- Or: continue branch `[branch]` in PR #[number].

Confirmed problem:
- [Observed behavior, error message or screenshot facts.]

Required behavior:
1. [Acceptance criterion]
2. [Acceptance criterion]
3. [Acceptance criterion]

Out of scope:
- [Features or refactors that must not be added]

Verification:
- [Specific interactions to test]
- Run the relevant checks from AGENTS.md.

Do not merge.
```

## Keep prompts efficient

- Describe observed behavior, not long theories about the cause.
- Include exact route, component, error message or PR number when known.
- Use screenshots only when they show information that cannot be stated clearly in text.
- Do not repeat repository-wide rules from `AGENTS.md`.
- Keep one task per PR.
- For a correction to an open PR, continue the same branch instead of starting over.
- Ask for database work only when the task actually needs it.
- Require a final summary of actual tests, SQL and limitations.

## Example

```text
Follow AGENTS.md.

Task:
Fix mobile focus loss in the Equipment editor.

Branch / PR:
- Start from latest main.

Confirmed problem:
- On iPhone, Product name, Payload and Shot size lose focus after one character.
- The keyboard closes immediately.

Required behavior:
1. Keep the active input focused during controlled-state updates.
2. Do not rerun sheet mount/focus effects on each keystroke.
3. Preserve scroll lock, Escape, backdrop and Close behavior.

Out of scope:
- No Equipment redesign.
- No database changes.
- No logging integration.

Verification:
- Type full values into every affected field on an iPhone-sized viewport.
- Run the relevant checks from AGENTS.md.

Do not merge.
```
