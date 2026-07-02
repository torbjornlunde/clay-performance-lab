# Tester feedback

This file tracks concrete feedback from beta testers so suggestions are not lost and testers can see that reporting issues and ideas leads to action.

## Prioritization rules

Tester feedback should normally be evaluated before new speculative features.

Highest priority:

1. data loss, incorrect results, blocked flows and security issues
2. repeated friction in core logging and import flows
3. small, clear improvements with high user value and low implementation risk
4. requests repeated by several testers
5. larger new capabilities that need design or architecture work

Not every suggestion will be built immediately, but every useful suggestion should receive a visible status and a short reason.

Suggested statuses:

- **New** – recorded, not evaluated
- **Accepted** – agreed and placed in the roadmap
- **Next** – planned for the next development cycle
- **In progress** – active branch or PR exists
- **Released** – available in production
- **Later** – useful, but behind more urgent work
- **Declined** – not planned, with a stated reason

When a tester suggestion is released, the tester or beta group should be told that it came from their feedback.

---

## Simon – 27 June 2026

### Competition activity summary

**Original need:** Show total number of competitions, total number of competition shots/targets and competitions within a selected year.

**Status:** Next

**Priority:** High-value quick win

**Planned minimum version:**

- total competitions across all recorded years
- total competition targets/shots across all recorded competitions
- number of competitions in the current year
- ability to choose another year
- clear distinction between competitions and training
- use imported and manually registered competition results without double-counting duplicates

**Why prioritized:** It gives immediate value from existing data, is easy for users to understand and came directly from an active tester.

### Custom name for guns and barrel setups

**Original need:** Under equipment, allow a custom name for a gun when the user owns more than one of the same model or uses different barrel sets.

**Status:** Next

**Priority:** High-value quick win

**Planned minimum version:**

- optional user-defined display name for each gun
- examples: `Blaser F3 76 cm`, `Blaser F3 81 cm`, `Training gun`, `Competition setup`
- keep manufacturer and model as structured fields
- optionally identify barrel length or barrel set separately
- show the custom name in session selection, history and comparisons
- existing equipment records must continue to work without a custom name

**Why prioritized:** It removes ambiguity in a core equipment flow and supports the planned gun-comparison feature.

---

## Samuel – beta feedback

### English Skeet training support

**Original need:** Add English Skeet because Samuel and shooters at his shooting ground use the discipline regularly in training.

**Status:** Accepted

**Priority:** High tester priority; larger discipline feature

**Planned minimum version:**

- English Skeet can be selected for training
- discipline-correct scorecard and terminology
- live hit/miss entry per target
- running score, final total and correction flow
- results stored as training and kept separate from competition totals
- mobile-friendly flow with few taps
- existing optional equipment selection remains available

**Important preparation:** Confirm the exact sequence, terminology and scorecard structure with Samuel before implementation. English Skeet must not be guessed from Olympic, American or other skeet variants.

**Why prioritized:** It comes from a verified, repeated real-world training need at an active tester’s shooting ground. It is larger than the two quick wins above, but should be considered before unrelated speculative features.

**Detailed roadmap:** [ROADMAP_ENGLISH_SKEET.md](./ROADMAP_ENGLISH_SKEET.md)
