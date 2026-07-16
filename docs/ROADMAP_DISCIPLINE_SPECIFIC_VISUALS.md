# Roadmap: discipline-specific visual dashboards

Status: Strategic design and product decision

## Decision

The app should visually adapt to the discipline the shooter is viewing. A Performance Report, dashboard or analysis page should not use the same generic layout for every discipline.

Standardized disciplines should have visual summaries that reflect the actual structure of the discipline.

## Why this matters

A list of numbers does not make the user feel understood. When a skeet shooter opens a report, the app should look like it understands skeet. When a trap shooter opens a report, it should look like it understands trap.

The visual layer should help the shooter immediately see:

- where targets are being lost
- what is improving
- what is strong
- what should be trained next
- how the result relates to the real layout of the discipline

This improves trust, usefulness and engagement.

## Core principle

Use the discipline's real-world structure as the visual model.

Examples:

- Skeet should show skeet stations, not only a table.
- Trap should show plates or standplaces, not only a total score.
- Sporting should show posts, stands, target types and pair types.
- Compak should show positions, A-F targets and pair structure where available.

## Skeet visual model

For skeet variants, the report should show:

- all stations in a recognizable layout
- hit rate per station
- miss count per station
- high-house versus low-house where relevant
- singles versus doubles
- first target versus second target in doubles
- strongest and weakest stations
- trend per station over time
- suggested station-specific training focus

Example insight:

`Station 4 is your biggest loss area. Most misses are on the second target in doubles. Prioritize controlled doubles from station 4 next session.`

## Trap visual model

For trap variants, the report should show:

- plates / standplaces 1-5 or the correct variant-specific structure
- hit rate per plate
- miss count per plate
- first-shot and second-shot outcomes where relevant
- start plate and rotation-aware miss mapping
- strongest and weakest plates
- trend per plate over time
- suggested plate-specific training focus

Example insight:

`You lose most targets from plate 4. This accounts for 36% of your misses in the selected period.`

## Sporting visual model

For sporting-style disciplines, the report should show:

- posts or stands
- target categories
- direction, distance, speed and angle where known
- pair type: single, report, simo, on-report and other relevant pair structures
- first bird versus second bird in pairs
- target definitions from imported or shared setups
- strongest and weakest target families

Example insight:

`Your largest loss is long left-to-right crossers, especially when they are the second bird in report pairs.`

## Compak visual model

For Compak Sporting, the report should support:

- shooting positions
- A-F target letters
- programme / scheme structure
- singles and pairs
- first and second target in pairs
- target-specific miss rates where programme data exists

## Performance Report requirements

Discipline-specific visuals should feed directly into the Performance Report.

The report should include:

- one main training focus
- discipline-specific visual map
- strongest area
- weakest area
- recent improvement
- concrete next training suggestion
- data confidence and sample-size warning

## Coach Report requirements

Coach Report should include the same discipline-specific visuals, but with more detailed underlying data:

- table behind the visual summary
- selected sessions and date range
- training versus competition split
- equipment where recorded
- sample sizes
- shooter notes
- exportable/shareable format

## Visual design requirements

- Mobile-first.
- Clear enough to read quickly.
- More visual than text-heavy.
- Works in dark and light mode.
- Does not depend only on color; labels and percentages must also be visible.
- Uses consistent design components across disciplines.
- Shows the discipline-specific layout without making every discipline a completely separate app.

## Data requirements

A discipline-specific visual page needs structured data. The app should only show detailed visuals when it has enough information.

Minimum data examples:

- Skeet: station and target sequence.
- Trap: start plate and rotation mapping.
- Sporting: post, target type and pair information.
- Compak: programme, position and target letter.

When data is missing, the app should show a simpler report and explain what extra information would improve the analysis.

## Guardrails

- Do not show false precision.
- Do not mix different discipline variants unless the comparison is valid.
- Do not show a station or plate map if the app does not know the correct mapping.
- Do not hide low sample size.
- Do not let visuals become decorative only; every visual block must answer a performance question.

## Locked decisions

1. Performance Report and analysis pages should visually adapt to the selected discipline.
2. Standardized disciplines such as skeet and trap should use station/plate maps as core visual elements.
3. Visual summaries must be driven by verified structured data, not assumptions.
4. The app should use discipline-specific visuals to make the user feel that the app understands their sport.
