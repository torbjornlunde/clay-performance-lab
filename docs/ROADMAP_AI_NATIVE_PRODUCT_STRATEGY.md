# Roadmap: AI-native product strategy

Status: Strategic product principle

## Decision

Clay Performance Lab should be built as an AI-native performance product, not just a scorekeeping app with AI text added on top.

The long-term advantage should be the ability to use advanced AI on real structured shooting data in a way that has not been done properly in clay target shooting before.

This means the app must be designed so the AI layer can improve over time as AI models, vision models, reasoning models and multimodal tools improve.

## Strategic advantage

Many apps can log scores. Some can show charts. A few can show simple statistics.

Clay Performance Lab should aim to do something stronger:

- understand discipline-specific shooting data
- combine results, misses, target definitions, equipment and session context
- analyze patterns across time
- explain what the pattern likely means and what it does not prove
- suggest a practical next training focus
- support coach-ready analysis
- improve as AI technology improves

The advantage is not only the data. The advantage is the interpretation layer.

## AI-native does not mean AI-only

The app should not give raw shooting history to an AI model and hope for a good answer.

The correct approach is hybrid:

1. structured data capture
2. deterministic validation and normalization
3. statistical pattern detection
4. discipline-specific rules and constraints
5. AI synthesis and reasoning
6. clear confidence / limitations
7. user-facing report and next action

Rules and statistics protect the product. AI makes the analysis useful, personal and adaptive.

## Data foundation

AI quality depends on data quality. The app should prioritize structured data that AI can use later:

- discipline and exact variant
- rule-set version
- training versus competition
- target order
- post / stand / station / plate
- target type
- direction
- angle
- distance
- speed
- pair type
- first bird / second bird
- start plate / station where relevant
- scorecard image import and reviewed corrections
- equipment used
- weather where available
- shooter notes and assumptions
- coach feedback where available later

Even if some AI features are built later, the data model should collect information in a way that makes future AI analysis possible.

## AI use cases

### Performance Report

AI should synthesize structured findings into a clear personal training focus.

It should answer:

- what is costing the shooter most targets now
- what is improving
- what is strong
- what should be trained next
- what the app does not know
- whether a coach review is useful

### Coach Report

AI can help prepare a coach-ready summary:

- patterns worth reviewing
- likely areas to ask the shooter about
- uncertainty and sample sizes
- key sessions and examples
- raw data behind conclusions

The coach should still do the final human analysis.

### Scorecard and target import

AI vision can help extract information from:

- scorecards
- stand/post signs
- target descriptions
- printed programmes
- handwritten notes where feasible

All imports must keep review-before-save.

### Training assistant

AI can later help convert patterns into suggested drills:

- target presentations to repeat
- station/plate focus
- session structure
- what to log next to improve the analysis

### Equipment and setup analysis

AI can later connect performance patterns with:

- gun
- barrel length
- choke
- ammunition
- lenses
- weather
- shooting ground

This must use sample-size warnings and should not overclaim causation.

### Multimodal future

Future versions may use:

- scorecard images
- target-sign photos
- pattern-board photos
- videos / ShotKam-style clips if available
- voice notes after a round
- coach annotations

The architecture should not assume AI input is only text.

## Continuous AI evolution

The product must be able to change with AI development.

Requirements:

- separate AI prompts / analysis logic from UI code where possible
- version AI analysis outputs
- store the analysis version used
- allow old reports to be reproduced or marked as generated with an older analysis version
- support model upgrades without rewriting the entire app
- use structured AI output, not only long free-text responses
- keep deterministic validation before and after AI responses
- collect user feedback on whether an AI insight was useful

## AI output format

AI features should prefer structured output that the UI can render.

Example fields:

- `main_focus`
- `evidence`
- `confidence`
- `limitations`
- `suggested_training`
- `positive_trend`
- `strong_area`
- `coach_review_recommended`
- `coach_review_reason`
- `data_needed_next`

This allows the same analysis to power:

- mobile cards
- dashboard widgets
- Performance Report
- Coach Report
- share/export views
- future notifications

## User trust

Advanced AI should make the app feel smarter, not less trustworthy.

The app should clearly show:

- what data the analysis is based on
- when sample size is low
- when training and competition are mixed
- when AI is suggesting a pattern versus diagnosing a cause
- when a real coach is better suited

Good product behavior:

`The pattern is clear enough to train this next, but not strong enough to diagnose why it happens.`

Bad product behavior:

`Your hold point is wrong.`

## Competitive position

Competitors may build live scoring, social feeds, trophies and simple stats.

Clay Performance Lab should compete by being the smarter performance layer:

- deeper analysis
- better discipline context
- stronger import/review flow
- better explanation of uncertainty
- better conversion from data to training action
- future-ready AI architecture

The public positioning should eventually be:

`Not just scorekeeping. AI-powered performance analysis for clay target shooters.`

This should only be used publicly when the product genuinely delivers on it.

## Guardrails

- Do not overclaim AI accuracy.
- Do not present AI as a replacement for a qualified coach.
- Do not invent data.
- Do not infer sensitive personal traits.
- Do not make unsupported technical diagnoses.
- Do not recommend paid coaches without clear disclosure.
- Do not hide whether an insight is based on weak data.
- Keep user review and control for imported data.
- Keep privacy and permissions central.

## Launch implication

The first public version does not need every advanced AI feature.

But the product should already show the direction:

- AI-assisted import where available
- Performance Report with AI synthesis over structured data
- clear training focus
- data confidence
- discipline-specific analysis

This is enough to prove that the app is more than a score log.

## Locked decisions

1. Clay Performance Lab should be treated as an AI-native performance product.
2. The long-term advantage should be advanced AI analysis over real structured shooting data.
3. Rules/statistics and AI must work together; neither should fully replace the other.
4. The architecture must allow AI models, prompts, schemas and analysis versions to evolve over time.
5. AI output should be structured so it can power UI cards, reports, exports and future features.
6. The app should use AI to create practical training focus, not just generic motivational text.
7. The app must be honest about confidence, limitations and when a human coach is needed.
