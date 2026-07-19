# Roadmap: Performance progressive disclosure

Status: Accepted product direction

Last updated: 19 July 2026

## Decision

The Performance area must serve two very different users at the same time:

1. the simple shooter who wants an immediate answer without learning a complex analytics product
2. the performance-focused shooter who wants to explore as much reliable data as Clay Performance Lab can provide

The solution is **progressive disclosure**, not aggressive removal of statistics.

The Performance cleanup in PR #221 went too far in reducing visible information. The correct long-term direction is:

> Simple at the top. Richer as the user scrolls. Deep detail behind expandable sections and drilldowns.

Performance must not become a duplicate Results/Training history page, but it should become the main place to explore performance data.

## Core UX principle

The page should reveal information in layers.

### Layer 1 – Immediate overview

The first screen should be understandable in seconds.

Typical content:

- compact filters
- Recent
- Best
- Trend
- Confidence
- concise winner/benchmark context
- one clear trend visualization
- one or a few high-signal focus areas when enough data exists

A simple shooter should be able to stop here and still receive useful value.

### Layer 2 – More context while scrolling

Below the immediate overview, the page should reveal additional useful statistics without requiring configuration.

Examples:

- Competition activity
- total competitions
- total competition targets
- selected-year activity
- recent form
- longer-term trend
- winner gap over time
- Training volume
- Competition vs Training context kept clearly separate
- shooting-ground comparison
- discipline breakdown

These sections should remain compact and skimmable.

### Layer 3 – Expandable deep dives

Users who want more detail can open sections, accordions, drawers or dedicated drilldowns.

Potential deep-dive categories include:

- by discipline
- by shooting ground
- by target type
- by presentation type
- by post / stand / station
- by first vs second target in a pair
- by first vs second shot where the discipline/data supports it
- by course/round/series
- by early / middle / late phase of a competition
- by Competition level/context
- by equipment
- by weapon
- by choke
- by ammunition
- by weather/environment
- by mental/performance context
- by time period
- by imported source / data completeness where useful

Only show a deep dive when enough relevant data exists.

## The page should feel simple even when it contains a lot

A large amount of data is acceptable if hierarchy is strong.

Use:

- compact section headers
- clear spacing between analysis levels
- short summaries before details
- collapsed accordions for advanced statistics
- drilldowns rather than huge inline tables
- `View details` / `Explore` actions
- sensible defaults
- remembered filter state where useful

Avoid:

- displaying every metric at equal visual weight
- long raw session lists
- giant empty cards
- repeated explanatory paragraphs
- making users configure analytics before seeing basic value
- hiding useful statistics simply to make the page shorter

## Performance is not Results history

Detailed session lists still belong in Results and Training.

Performance may show:

- compact recent form
- selected examples
- top/bottom relevant sessions
- links to underlying sessions

But it should not become a second full archive.

The distinction is:

- **Results / Training:** what happened, session by session
- **Performance:** what the accumulated data says

## Competition activity must remain a product feature

The earlier Competition activity statistics should not be considered obsolete merely because the large section was removed from Performance during cleanup.

Retain access to:

- all-time number of competitions
- all-time competition targets
- selected-year competitions
- selected-year targets
- year selection

The final placement can be compact within Performance, a drilldown, or another clearly discoverable statistics area.

## Progressive complexity by available data

The Performance experience should naturally become richer as the shooter logs more detail.

### Minimal user

Has only Competition results.

Show useful analysis from:

- own score
- winning score
- placement where known
- competition date
- discipline
- shooting ground
- historical trend
- activity

### Intermediate user

Also logs scorecard/post-level results.

Add:

- post/course/series patterns
- miss positions
- phase patterns
- more reliable recent-form analysis

### Advanced user

Also logs target definitions, miss reasons, equipment and context.

Add:

- target/presentation patterns
- reason patterns
- equipment segments
- weather correlations
- mental/performance context
- deeper AI-supported synthesis

The app should never punish a simple user for not logging advanced data.

## Data honesty

More statistics must not mean more false certainty.

Every advanced breakdown should account for:

- sample size
- data completeness
- Competition vs Training
- different disciplines
- different event difficulty
- different winner/field strength
- possible confounding factors

Do not render meaningless breakdowns from tiny samples merely because the database contains the field.

## Personalization later

The app may later remember which sections a user tends to open and keep those easier to access, but the default structure must remain understandable without setup.

Potential future options:

- pin favorite metrics
- reorder advanced sections
- save a Performance view
- `Simple` and `Detailed` view preferences

Do not require users to choose a mode before they understand the product.

## Recommended page hierarchy

A likely long-term structure:

```text
Performance
[compact filters]

OVERVIEW
[Recent] [Best] [Trend] [Confidence]
Benchmark / winner context
Trend chart
Focus areas

ACTIVITY & FORM
Competition activity
Recent form
Training volume (when relevant)

BREAKDOWNS
By discipline
By shooting ground

DEEPER PERFORMANCE DATA
[Target & presentation ▾]
[Posts / stands / stations ▾]
[Competition phases ▾]
[Equipment ▾]
[Weather & environment ▾]
[Mental context ▾]

REPORTS & INSIGHTS
Performance Report
Underlying evidence / sessions
```

Actual sections should be conditional on the data available.

## Roadmap items

- PERF-PD-01: restore progressive-disclosure Performance architecture after the over-aggressive cleanup
- PERF-PD-02: preserve simple top-level summary
- PERF-PD-03: restore useful Competition activity statistics in a compact form
- PERF-PD-04: add compact activity/recent-form layer below overview
- PERF-PD-05: expandable deep-dive analysis sections
- PERF-PD-06: discipline-specific breakdowns and visuals
- PERF-PD-07: target/presentation/post/stand analysis where data supports it
- PERF-PD-08: equipment timeline analysis when available
- PERF-PD-09: weather/environment analysis when available
- PERF-PD-10: mental-context analysis when available
- PERF-PD-11: data completeness and sample-size confidence for each deep dive
- PERF-PD-12: direct links from insights to underlying sessions without showing a full archive inline

## Locked product decision

Performance should **look simple at first glance but become progressively more powerful as the user scrolls and opens deeper sections**.

Do not interpret `keep Performance compact` as `remove most statistics`.

The goal is controlled information density through hierarchy and progressive disclosure.
