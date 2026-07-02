# Roadmap: discipline platform and App Store launch coverage

Status: Strategic product and architecture decision

## Decision

Clay Performance Lab should not reach the App Store as an app for only a narrow set of Norwegian sporting disciplines. Before public launch, the app should support a broad, credible selection of sporting, trap and skeet disciplines so users in several countries can find a discipline they actually shoot.

Broad coverage must be achieved through shared discipline engines and versioned rule sets, not by copying complete implementations for every variant.

## Product objective

The first public version should:

- be useful to shooters from several discipline families and regions
- provide discipline-correct scorecards rather than generic result fields
- make scorecard photo import a central competition flow where appropriate
- preserve the exact discipline variant and rule-set version
- provide analysis that is meaningful for the selected discipline
- allow new variants to be added without rebuilding import, storage and analysis from scratch

## Shared architecture

The app should use a common fixed-program foundation where possible, with family-specific engines on top.

### Common fixed-program foundation

The shared model should be able to describe:

- discipline family
- exact variant identifier
- localized name and common aliases
- governing organization or rule source where relevant
- rule-set version and effective date
- training or competition
- rounds and series
- stations or plates
- starting station per round or series
- shooter rotation
- ordered target or shot positions
- singles and doubles
- source machine, house or machine group
- number of shots allowed per target
- scoring for first and second shot
- option, repeat or replacement-target rules
- handicap or shooting distance
- qualification, final and shoot-off formats where later required
- expected target count and score validation
- scorecard layout and import mapping

Each saved result must identify the exact variant and rule-set version used.

### Family-specific engines

The common foundation should be extended by separate family logic rather than one oversized universal screen.

- **Sporting engine:** variable posts, stands, target definitions and pair types.
- **Trap engine:** starting plate, shooter rotation, machine or trench programme, permitted shots and scorecard-position mapping.
- **Skeet engine:** stations, high/low house, fixed sequence, singles/doubles, option rules and gun-position or delay rules.

Shared components can include import review, equipment selection, hit/miss storage, corrections, history and statistics.

## Competition logging principle for trap and skeet

Direct live logging is not the primary competition flow for trap and skeet.

The preferred flow is:

1. select the exact discipline variant
2. create or import the competition result
3. enter the starting plate or starting station for each round where required
4. photograph the scorecard
5. extract the ordered hit/miss values
6. map each scorecard position through the discipline rule set
7. show a review screen
8. save the approved result and station-specific data

The original scorecard position, calculated station and any user correction should be retained.

## Analysis objective

The value is not only the total score. The app should be able to identify where the shooter loses targets.

Examples:

- miss rate per plate or station
- most problematic plate or station
- trend per plate or station over time
- training versus competition
- first-shot versus second-shot outcomes where relevant
- first or second target in a double
- high-house versus low-house in skeet
- exact presentation within a fixed programme
- specific training priorities based on repeated patterns

Statistics from different variants must not be combined without a clear, valid comparison level.

## Target coverage before App Store launch

The exact launch list should be confirmed through tester demand and implementation quality. The architecture should be designed for the full families from the beginning.

### Already important sporting coverage

- Leirduesti
- Compak Sporting
- English Sporting
- Sporttrap
- relevant result-only and import flows

### Trap launch candidates

High-priority candidates that together test different parts of the trap engine:

- Jegertrap
- Nordisk Trap
- Olympic / International Trap
- Automatic Ball Trap, including relevant ABL/ABT naming aliases
- Universal Trench
- Down-the-Line
- American Trap Singles

Additional candidates after the engine is proven:

- American Trap Handicap
- American Trap Doubles
- Double Trap
- DTL Single Barrel
- Double Rise
- distance-handicap formats
- Continental or Wobble Trap where verified demand exists
- other national hunting-trap variants

### Skeet launch candidates

- English Skeet
- Olympic / International Skeet
- American Skeet

English Skeet remains the first verified beta-tester request, but it should be implemented on the shared skeet foundation.

## Prioritization before NM

The immediate NM opportunity should be used to validate the trap platform with real users.

Recommended order:

1. stabilize current production flows and scorecard import
2. deliver the small accepted beta-tester improvements where they do not delay the NM-critical work
3. build the general trap foundation and versioned rule-set model
4. add Jegertrap and Nordisk Trap through the same programme definition
5. require starting plate per round or series where needed
6. map scorecard-import positions to the correct plate
7. show basic plate-specific statistics and training priorities
8. test with real scorecards from several shooters before NM
9. freeze large changes close to the event and only fix clear defects

## Prioritization after NM and before App Store launch

1. use NM feedback to harden the trap engine and import review
2. add trap variants that exercise genuinely different rules instead of only near-identical copies
3. build the shared skeet foundation and English Skeet
4. add a second skeet variant to prove that the foundation is reusable
5. expand toward the target launch catalogue
6. localize discipline names, terminology and scorecards
7. verify each variant with an active shooter and a reliable rule source
8. complete App Store readiness only after the supported disciplines are stable and honestly described

## Quality gate for each discipline variant

A variant is not considered supported until:

- its exact scorecard sequence is documented
- its rule source and version are recorded where available
- a complete round can be imported or entered correctly
- starting station and rotation logic are verified where relevant
- corrections do not shift later target mappings incorrectly
- totals and validation rules are correct
- the variant is kept separate in statistics
- an active shooter for that variant has reviewed terminology and flow
- existing disciplines remain unaffected

## Important boundary

Broad coverage is a launch advantage only when the variants work reliably. The app should not list many disciplines that are merely aliases for a generic form or that have not been tested.

The goal is a broad but credible launch catalogue built on reusable engines, not the largest possible discipline list at the expense of trust.

## Locked decisions

1. Trap and skeet architecture must account for the wider international discipline families before the first variants are implemented.
2. Similar variants share engines and configuration, but retain separate discipline identities, rules and statistics.
3. Several important trap and skeet variants should be implemented before App Store launch to improve early international relevance and user acquisition.
4. Scorecard photo import and starting-station mapping are core competition features for fixed-program trap and skeet disciplines.
5. New variants should normally be added as versioned rule sets, not copied feature branches or duplicate scorecard systems.
6. Public launch should be delayed rather than claiming support for variants that have not passed the quality gate.
