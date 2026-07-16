# Roadmap: ClayArena import

Status: Future import source

## Decision

Clay Performance Lab should consider ClayArena as a future result import source.

This should not be the next active PR while current beta quick wins and core logging improvements are being completed, but it is strategically useful for broader European / international adoption.

## Why this matters

ClayArena is used for clay target competition results outside the Leirdue.net ecosystem. Supporting ClayArena can make the app more useful for shooters who compete internationally or in events published outside Norway.

A ClayArena import would complement:

- Leirdue.net import
- scorecard photo import
- manual result-only entry
- future international competition history

## First product direction

Do not start with broad automatic crawling.

First version should be **URL import**:

1. User pastes a ClayArena competition/result link.
2. App fetches the public result page.
3. App parses the visible result table where possible.
4. App suggests matching shooter rows based on user profile name/aliases.
5. User selects the correct row.
6. App shows a review screen.
7. User confirms before anything is saved.
8. App saves a result-only competition entry with ClayArena as the source.

## Data to extract in v1

Attempt to extract:

- competition name
- competition date
- discipline
- shooting ground / venue / country where available
- shooter name
- shooter category/class
- placing/rank
- round scores
- total score
- winning score
- target count if safely detectable
- source URL
- import timestamp
- source system: `clayarena`

If some fields cannot be extracted safely, leave them blank and show that in review.

## Parsing approach

Preferred first approach:

- HTML parsing from a pasted public result URL.
- Use PDF download only as fallback later.
- No background crawling of the site.
- No import without user review.

Potential issues:

- result tables may vary between disciplines/events
- names may be formatted differently, e.g. surname first
- shoot-off or finals values may be represented as extra text
- category labels may vary
- target count may not always be explicit
- pages may be live/unfinished
- international character handling matters
- PDF output may be easier for some competitions but harder for robust parsing

## Duplicate handling

ClayArena imports should use source URL and competition metadata for duplicate protection.

At minimum:

- warn if the same ClayArena URL has already been imported
- avoid importing the same shooter row twice from the same source URL
- let the user update/replace an existing import only after review

Do not invent aggressive duplicate logic if the source data is incomplete.

## UX requirements

The flow should be similar to Leirdue.net import and scorecard import:

- paste link
- fetch / parse
- review detected competition
- choose shooter row
- review score and metadata
- confirm save
- clear error messages if parsing fails
- fallback to manual result entry

The user should always understand what was imported and what was uncertain.

## Privacy and source rules

- Only import from a user-provided URL.
- Do not crawl all ClayArena competitions in the background.
- Do not save other shooters’ rows as user data unless the user explicitly chooses their own row.
- Store source and confidence/parse status where possible.

## Integration with Performance Report

ClayArena imports should count as competition results.

They should support:

- competition activity summary
- result trend
- winner comparison if winning score is detected
- discipline-specific stats only where target-level detail is available
- clear limitation when only total score is imported

ClayArena result-only entries should not pretend to have target-by-target miss data.

## Not in v1

Do not include in first version:

- automatic full-history crawling
- importing every shooter from a competition
- PDF parsing unless HTML parsing is insufficient
- target-by-target detail unless the source actually provides it
- social/leaderboard features
- paid/pro gating

## Implementation timing

Suggested order:

1. Finish current beta quick wins and core competition logging improvements.
2. Improve equipment naming / barrel setup naming.
3. Then consider ClayArena URL import v1.

## Locked decisions

1. ClayArena import is useful for future international coverage.
2. First version should be user-pasted URL import, not automatic crawling.
3. HTML parsing should be attempted first; PDF can be fallback later.
4. User review is required before saving imported data.
5. Store source system and source URL for duplicate protection and transparency.
6. ClayArena result-only imports should contribute to result and competition activity stats, but not target-level analysis unless target-level data exists.
