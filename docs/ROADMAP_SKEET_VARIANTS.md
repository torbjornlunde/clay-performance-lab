# Roadmap: felles skeet-grunnlag og skeetvarianter

Status: Accepted tester request and shared architecture proposal

Requested need: Samuel wants English Skeet because it is used regularly for training at his shooting ground.

## Product decision

Build one shared skeet foundation, then define each skeet variant as its own rule set on top of that foundation.

The variants should be designed together so the data model and live scorecard do not have to be rebuilt later. They should not all be forced into one identical discipline, and they do not all have to be released in one large PR.

## Why a shared foundation makes sense

The skeet variants share much of the same basic domain:

- high house and low house
- fixed shooting stations
- singles and doubles
- hit/miss scoring
- target order within a round
- running and final totals
- corrections during or after the round
- training and competition history

The important differences should be configuration or variant-specific rules rather than duplicated pages and database structures.

## Variant differences that must remain explicit

Each variant may define its own:

- stations used
- target sequence
- high-house and low-house order
- singles and doubles
- option or repeat-target rules
- gun position
- target-release timing or delay
- number of targets and rounds
- competition and final formats
- terminology
- ammunition, equipment or discipline restrictions where relevant

A result must always store the exact variant and rule-set version used.

## Initial candidate variants

The first architecture review should at minimum consider:

- English Skeet
- Olympic / International Skeet
- American Skeet

Additional national or local skeet variants should only be added after confirming an actual user need and obtaining a reliable rule set.

## Shared technical model

A configuration-driven skeet programme could contain:

- stable variant identifier
- display name and aliases
- rule-set version and effective date
- ordered stations
- ordered presentations per station
- source house for each target
- single or double
- required first target in a double
- option-target behavior
- gun-position rule
- release-delay rule
- expected target count
- training and competition capabilities

The live scorecard should render from this programme rather than hard-coding one page per variant.

## Recommended delivery plan

### Phase 1: Shared skeet foundation and English Skeet training

- create the common skeet data model and scorecard engine
- add English Skeet as the first verified rule set
- support live hit/miss, corrections and totals
- store sessions as training
- validate sequence and terminology with Samuel

### Phase 2: Second variant as architecture proof

- add the next variant without copying the English Skeet implementation
- verify that different sequences and rules can be expressed through configuration
- choose the variant based on tester demand, likely Olympic / International Skeet if relevant to the beta group

### Phase 3: Remaining relevant variants

- add other verified variants through separate, small PRs
- add competition flows only where users actually need them
- keep score history and statistics separated by exact variant

## First useful user experience

- user chooses `Skeet`
- app then shows the available skeet variants
- the user can set a preferred default variant in the profile
- the selected variant opens the correct live scorecard
- results show the full variant name, not only `Skeet`
- training and competition remain separate

## What should be shared across variants

- UI shell and navigation
- hit/miss controls
- correction flow
- totals
- equipment selection
- offline strategy
- result storage
- history components
- general statistics framework

## What must not be incorrectly combined

- scores from different variants in one undifferentiated average
- station-specific statistics where the sequence differs
- competition records with different rules
- target order, gun position or timing assumptions

Combined skeet totals may be shown later, but the user must be able to filter and compare by exact variant.

## Testing and verification

Before a variant is released:

- obtain an authoritative or governing-body rule source where available
- record the rule-set version or effective date
- have an active shooter for that variant review sequence and terminology
- test a full round and correction flow
- verify the target total
- verify that existing disciplines are unaffected

## Not required in the first PR

- every skeet variant in production
- all competition and final formats
- photo scorecard import
- coach-specific skeet reports
- detailed target-flight analysis
- shared official competition templates

## Acceptance criteria for the foundation

- English Skeet can be completed as a discipline-correct training round
- another skeet variant can later be added without creating a duplicate scorecard system
- the stored result identifies the exact variant and rule-set version
- variant differences are handled through explicit rules, not hidden assumptions
- Samuel confirms the English Skeet flow

## Locked decision

The app should build a shared skeet foundation and plan the relevant variants together. English Skeet remains the first delivered variant because it is the verified beta-tester need. Other variants should be added as separate, reviewable rule sets and can be released in later PRs rather than making the first implementation unnecessarily large.
