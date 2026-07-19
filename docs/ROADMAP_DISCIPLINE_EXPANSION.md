# Roadmap: Broad shotgun discipline support

Status: Planned strategic workstream

Last updated: 19 July 2026

## Decision

Clay Performance Lab should not remain a product for only the currently implemented sporting-style disciplines.

The long-term product direction is to support the major clay target shotgun disciplines through discipline-correct schemas, scorecards, terminology, import rules and analysis.

The architecture should be built so new disciplines are added as explicit discipline modules/profiles rather than forcing every discipline into one generic scorecard model.

## Why this matters

Different shotgun disciplines vary materially in:

- round structure
- number of targets
- stations/posts/stands
- shooting order
- single vs double targets
- pair rules
- first/second target semantics
- squad rotation
- finals and shoot-offs
- scoring representation
- competition formats
- useful performance metrics

A generic `score + total targets` model is useful for result-only history, but not enough for detailed performance analysis.

## Product principle

Every discipline should be able to exist at three levels where practical:

1. **Result-only**
   - score
   - total targets
   - competition metadata

2. **Detailed result**
   - round/series/course breakdown
   - discipline-correct structure

3. **Live / target-by-target**
   - exact shot/target result where the discipline and user need justify it

Not every discipline needs all three levels on day one.

## Discipline module/profile architecture

A discipline definition should be able to describe:

- canonical discipline name
- aliases/import names
- governing/rule family where relevant
- scorecard structure
- round/series count
- targets per round
- station/post/stand structure
- rotation rules where relevant
- single/double/pair semantics
- first/second shot semantics
- allowed corrections
- target completeness rules
- finals/shoot-off structure where relevant
- terminology used in the UI
- import mappings
- live scoring UI needs
- Performance metrics that make sense for the discipline

The app should not hardcode sporting assumptions into shared analysis components.

## Current strong coverage / baseline

Current product work already covers or partially covers:

- Leirduesti
- Kompakt leirduesti
- Compak Sporting
- Sporttrap
- English Sporting / sporting-style post-based flows
- result-only handling for broader imported Competition data

Some names/variants may currently be normalized differently in import flows. Official discipline naming should be preserved in user-facing UI.

## Expansion families

The exact order should follow real users and available data, but the architecture should cover these broad families.

### Sporting / field disciplines

Examples include:

- Leirduesti
- Kompakt leirduesti
- FITASC Sporting
- Compak Sporting
- English Sporting
- Sportrap / Sporttrap variants

Important needs:

- variable targets per stand/post
- singles and different pair types
- course/stand target definitions
- presentation metadata
- target order
- flexible competition layouts

### Trap disciplines

Examples may include national and international variants such as:

- Jegertrap / Nordisk trap
- Olympic Trap
- Universal Trench
- ATA / American Trap variants
- Double Trap where historical or active result support is useful

Important needs:

- round/series structure
- station rotation
- target/angle categories where data exists
- first/second shot information where relevant
- discipline-specific result and trend metrics

Do not assume all trap variants share identical target or rotation rules.

### Skeet disciplines

Examples may include:

- Olympic Skeet
- American Skeet
- national skeet variants where user demand exists

Important needs:

- station sequence
- high/low house target semantics
- singles/doubles
- shot order
- optional exact miss position
- discipline-specific station analysis

### Other shotgun target disciplines

Additional disciplines can be added when there is real user demand, reliable rules and a useful data model.

The roadmap should remain extensible rather than claiming the initial list is permanently exhaustive.

## First expansion priority

The next discipline work should not be chosen only by ease of implementation.

Prioritization should consider:

1. active beta-user demand
2. result/import availability
3. how much detailed analysis value the discipline can gain
4. international adoption value
5. complexity and testability

A sensible near-term direction is to strengthen the currently imported Norwegian trap variants and then add high-value international trap/skeet support, while keeping FITASC Sporting as a separate deliberate workstream because of its more complex layout and scoring structure.

## FITASC Sporting

FITASC Sporting should eventually have first-class support.

It should not simply reuse generic Leirduesti structure if that would lose discipline-specific rules or presentation order.

Potential needs include:

- parcours/layout structure
- shooting positions
- target programmes
- singles/doubles presentation rules
- exact target sequence
- scorecard import
- live/detailed scoring
- Performance analysis

Shared competition setup support for FITASC Sporting remains out of scope until the schema is proven safe.

## Trap analysis direction

Where detailed data exists, future trap analysis may include:

- performance by station
- performance by target direction/category
- first-shot vs second-shot outcomes
- ground-specific patterns
- round progression
- late-round/late-day patterns

Do not fabricate target direction for imported results that contain only total scores.

## Skeet analysis direction

Where detailed data exists, future skeet analysis may include:

- station performance
- high-house vs low-house patterns
- singles vs doubles
- first vs second target in doubles
- sequence/pressure patterns

## Import and source normalization

Each discipline module should define aliases from sources such as:

- Leirdue.net
- ClayArena
- scorecard photo import
- manual entry
- future federation/result systems

Normalization should preserve:

- original source label
- canonical internal discipline
- variant/rule set when relevant

Do not merge distinct disciplines merely because their names look similar.

## Rule/version awareness

Long-term, discipline records should be able to carry a rule-set/version context when changes in official rules materially affect scorecard structure or analysis.

The app does not need to expose complex rule-version controls to normal users unless required.

## Shared components vs discipline-specific components

Reuse should happen at the correct layer.

Good shared components:

- result metadata
- common session lifecycle
- generic score totals
- filters
- review-before-save patterns
- offline/sync infrastructure

Discipline-specific components may be required for:

- scorecard grid
- station rotation
- pair/double semantics
- finals
- live scoring flow
- performance visualizations

## Roadmap IDs

- DISC-01: formal discipline registry/profile architecture
- DISC-02: audit and normalize current discipline aliases
- DISC-03: strengthen Jegertrap / Nordisk trap support
- DISC-04: first-class Olympic Trap support
- DISC-05: first-class Olympic Skeet support
- DISC-06: Universal Trench support
- DISC-07: American Trap/Skeet variants based on demand
- DISC-08: first-class FITASC Sporting support
- DISC-09: discipline-specific live scorecards
- DISC-10: discipline-specific Performance analytics
- DISC-11: rule/version-aware discipline metadata

## Locked decisions

1. Clay Performance Lab should be extensible to the major shotgun clay target disciplines.
2. Do not force all disciplines into one generic detailed scorecard schema.
3. Result-only support may arrive before detailed/live support for a discipline.
4. Official discipline names should be preserved in user-facing UI.
5. Norwegian-specific disciplines should remain supported while international disciplines expand.
6. Detailed analytics must only use data actually available for that discipline/session.
7. FITASC Sporting remains excluded from shared competition setups until its discipline-correct structure is implemented and tested.
