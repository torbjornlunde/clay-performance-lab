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

## Torbjørn – NM week 2026

### Detailed competition logging was too heavy during real competition week

**Original situation:** During NM week, the user had two NM events, four Khan Arms Cup events and twelve press/training rounds. In that situation, it was only realistic to log the competition/result and upload score sheets. The 12 press rounds were logged only as training.

**Pain points:**

- Setting up every clay target and pair during competition was too time-consuming.
- The app asked for too much target/pair detail at the wrong moment.
- Existing dropdowns did not describe clay presentations well enough.
- The user had to add Leirdue.net links afterward, which added friction.
- Detailed target setup was attempted for two Khan Arms Cup competitions, but the flow felt too cumbersome.

**Status:** Accepted

**Priority:** Core product friction; important before broader beta / App Store readiness

**Product decision:** Detailed target setup must become optional, progressive and much more visual. The app should not force full course/target setup before or during busy competition logging.

**Planned direction:**

- Keep fast result + score sheet upload as the primary competition-week flow.
- Let users add Leirdue.net link during creation/import/session detail without awkward after-editing.
- Let detailed target definitions be added later, especially for misses or important stands.
- Support partial detail: missed targets only, difficult stands only, or full setup when the user has time.
- Build a visual target builder based on speed, angle, distance and position relative to the shooter.
- Use AI to draft target descriptions from voice/text/photo where possible, with user review before save.

**Detailed roadmap:** [ROADMAP_VISUAL_TARGET_BUILDER.md](./ROADMAP_VISUAL_TARGET_BUILDER.md)

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

**Status:** Implemented in PR - pending review

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

**Architecture decision:** Build a shared skeet foundation so English Skeet, Olympic / International Skeet, American Skeet and later verified variants can use the same scorecard engine and data model. English Skeet remains the first released variant because it is the confirmed tester need.

**Planned minimum version:**

- shared configuration-driven skeet scorecard foundation
- English Skeet can be selected for training
- discipline-correct English Skeet scorecard and terminology
- live hit/miss entry per target
- running score, final total and correction flow
- results stored as training and kept separate from competition totals
- result stores the exact skeet variant and rule-set version
- mobile-friendly flow with few taps
- existing optional equipment selection remains available

**Important preparation:** Confirm the exact English Skeet sequence, terminology and scorecard structure with Samuel before implementation. The shared foundation should be designed for several variants, but the variants must not be treated as identical or mixed in statistics.

**Why prioritized:** It comes from a verified, repeated real-world training need at an active tester’s shooting ground. Building the reusable skeet foundation now avoids duplicating the implementation when another skeet variant is requested.

**Detailed roadmap:** [ROADMAP_SKEET_VARIANTS.md](./ROADMAP_SKEET_VARIANTS.md)
