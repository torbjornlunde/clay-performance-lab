# Roadmap: Performance Report and Coach Report

Status: Strategic product decision

## Decision

The app should use two different report concepts:

1. **Performance Report** – the shooter-facing report that helps the user understand what to work on next, even without a real coach.
2. **Coach Report** – the external-coach report that gives a human coach richer data, context and exports for deeper analysis.

The first product focus should be the Performance Report. Coach Report should build on the same data, but serve a different user and a different job.

## Why this matters

A plain list of statistics is not enough. The report must pull the shooter into the app by turning data into a clear performance story:

- what is costing the shooter targets
- what has improved
- what is strong
- what should be trained next
- when the app has enough data to be confident
- when the app does not have enough data and should say so

The app should be useful even when the shooter does not have a real coach.

## AI analysis layer

Performance Report should include a real AI analysis layer. It should not only be a rule-based prompt that inserts statistics into fixed text.

The right model is hybrid:

1. deterministic data preparation
2. statistical pattern detection
3. discipline-specific context
4. AI reasoning over structured findings
5. confidence and guardrails
6. user-facing explanation and next action

### Deterministic data preparation

Before AI generates any insight, the app should prepare clean structured facts:

- selected time range
- training versus competition split
- discipline and variant
- total targets / shots
- hit rate and miss count
- target categories where known
- pair type and first/second bird where relevant
- stand / station / plate where known
- equipment used where recorded
- trend compared with previous period
- sample size per finding
- data-quality warnings

This layer must be deterministic and testable.

### Pattern detection

The app should calculate candidate findings before AI writes the report.

Examples:

- largest target-loss category
- weakest station / plate / stand
- strongest area
- most improved area
- repeated issue across several sessions
- training-only pattern versus competition-confirmed pattern
- equipment-linked difference where sample size is large enough
- low-confidence findings that should not be over-emphasized

### AI reasoning

AI should then analyze the structured findings and produce:

- the main training focus
- why this focus was selected
- what evidence supports it
- what the app cannot know from the data
- what the next practical training should be
- whether a real coach review may be useful
- an explanation in plain shooter language

The AI should be allowed to connect patterns across multiple dimensions, for example:

- repeated second-bird misses in report pairs
- mostly on longer crossers
- stronger pattern in competition than training
- no clear equipment link
- enough data to suggest training focus, but not enough to diagnose technique

### What AI must not do

AI must not:

- invent target data that was not logged
- diagnose technique as fact when only result data exists
- claim a cause such as eye dominance, hold point, timing, gun fit or choke unless the data actually supports it
- hide low sample size
- mix training and competition without saying so
- pretend different discipline variants are directly comparable
- make a coach marketplace recommendation look like neutral analysis if it is paid placement

### User-facing AI style

The report should feel like a performance assistant, not a generic chatbot.

Good style:

`Your biggest current loss is the second bird in report pairs. The pattern is strongest on longer left-to-right targets. Train this first, but treat the cause as open until you have video or coach feedback.`

Bad style:

`You are bad at report pairs because your timing is wrong.`

### AI output should be structured

The AI should return structured output, not just free text.

Example fields:

- `main_focus_title`
- `main_focus_reason`
- `evidence_points`
- `confidence_level`
- `confidence_reason`
- `training_plan`
- `positive_trend`
- `strong_area`
- `coach_review_recommended`
- `coach_review_reason`
- `limitations`

The UI can then render the same AI result as cards, charts, report sections and share/export views.

### AI and rules together

Rules should protect the analysis, not replace it.

Examples:

- A rule can block AI from giving a high-confidence recommendation when sample size is too small.
- A rule can require training and competition to be separated.
- A rule can require the AI to cite which data points support an insight.
- A rule can suppress equipment comparisons below a minimum target count.

AI should do the higher-level synthesis and wording.

## Performance Report

### User

The shooter.

### Job

Help the shooter quickly understand the most important performance pattern and what to do next.

### Tone

Direct, practical and motivating. It should not feel like a spreadsheet or a coach pretending to know more than the data supports.

### First useful version

The Performance Report should include:

- one main training focus
- three insight cards
- biggest target losses
- strongest area
- recent change or improvement
- trend over the selected period
- data confidence warning when sample size is low
- separation between training and competition
- suggested next training session
- clear visual blocks instead of long tables

### Example structure

1. **Main focus**
   - `Your next focus: long left-to-right crossers from 25–35 m`
   - Explain why this is selected.

2. **What costs you most targets**
   - show the categories, stands, plates, or presentations with the largest loss

3. **What is improving**
   - show one positive trend, not only weaknesses

4. **What you are already strong at**
   - reinforce confidence and avoid making the app feel negative

5. **Recommended next training**
   - 2–4 practical drill suggestions based on the data

6. **Confidence and limits**
   - show if the recommendation is based on too few targets, mixed difficulty, or mostly training data

## Coach Report

### User

A real human coach receiving data from the shooter.

### Job

Give the coach enough structured data to analyze the shooter independently.

### First useful version

The Coach Report should include:

- selected time range or selected sessions
- training and competition split
- totals, hit rate and trend
- miss patterns by target type, pair type, stand, plate or station where available
- first bird versus second bird where relevant
- equipment used where recorded
- notes and assumptions from the shooter
- data confidence and sample sizes
- raw details behind the app’s conclusions
- export or share preview

The Coach Report can be more data-heavy than the Performance Report, but it must still be clean and professional.

## Difference between the two reports

| Area | Performance Report | Coach Report |
|---|---|---|
| Main user | Shooter | External coach |
| Purpose | Decide what to train next | Analyze the shooter deeply |
| Style | Short, visual, action-oriented | More detailed and exportable |
| Data depth | Summarized | Richer and more transparent |
| Output | Training focus | Coach-ready report |
| Works without coach | Yes | No, this is for sharing |

## When the app should recommend a real coach

The app should not pretend to replace a skilled coach. It should recommend using a real coach when:

- the same weakness persists over several sessions
- the data suggests a possible technical issue but cannot diagnose the cause
- progress has stalled despite repeated training focus
- there are conflicting patterns that need human interpretation
- the shooter asks for a deeper review
- the sample size is large enough to show a real pattern, but the likely cause is not clear

Example message:

`You have repeated misses on the second bird in report pairs, but the data cannot tell whether this is line, hold point, timing, or visual pickup. This is a good case for a coach review.`

## Coach marketplace idea

Later, the app may include a coach directory or recommendation system.

Possible model:

- coaches can apply or be approved before listing
- paid coach listings or sponsored placement may be offered
- paid placement must be transparent
- users should know when a coach is recommended because of fit versus because the coach pays to be listed
- ranking should consider discipline, location, language, online/in-person coaching, skill level and user need
- coach profiles can include specialities, credentials, price range and availability

This can become a revenue stream, but trust is more important than short-term monetization.

## Guardrails

- The app must not make unsupported technical diagnoses.
- Paid coach placement must be disclosed clearly.
- The app should recommend a coach because the user’s situation warrants human input, not just because the marketplace exists.
- Performance Report should not become hidden advertising for coaches.
- Coach Report must only share data the shooter chooses to share.
- A coach should not get access to the shooter’s private history unless explicitly granted.
- AI must not invent causes or confidence that the underlying data does not support.
- AI insights should be grounded in structured facts and rendered with visible confidence / limitations.

## Visual and engagement requirements

The report must be visually engaging enough that users want to open it again.

Requirements:

- strong top card with a clear answer
- short explanations in plain language
- visual cards instead of long raw lists
- progress and improvement included, not only problems
- clear next action
- attractive share/export view
- mobile-first layout
- enough personality to feel like a performance product, not an admin report

## Launch priority

Performance Report should come before a full Coach Report because it helps every user immediately. Coach Report should then become the richer external sharing layer.

## Locked decisions

1. The shooter-facing feature should be called **Performance Report** first.
2. Coach Report should be a separate, more data-rich export or sharing view for real coaches.
3. The app should remain useful without a real coach.
4. The app may later recommend a real coach when the data shows that human interpretation is needed.
5. A future coach marketplace can be a revenue stream, but paid placement must be transparent and must not undermine trust.
6. Performance Report must include a real AI analysis layer over structured shooting data, not only fixed rule-based text.
7. Rules and statistics should prepare and protect the analysis; AI should synthesize the findings, explain them and suggest the next action.

## 2026 deterministic Performance page improvements

The current Performance page now includes the deterministic first layer needed for a more useful Performance Report without making any AI calls:

- Filters for discipline, period and data type, defaulting to Competition and This season.
- A top-level filtered summary with recent average, best result, cautious trend direction, results counted and data confidence.
- Period comparison for fixed windows, this season and all-time recent-vs-previous splits.
- A compact Recent form section showing the latest filtered scored results.
- Competition-only winner context with average, best and latest gap to winner when valid winning scores exist.
- Shooting ground analysis remains competition-based and respects the selected period and discipline instead of mixing training venue data.

Data confidence is based on sample size only. Training and competition remain separated, and mixed views warn that the results may not be directly comparable. Future AI interpretation remains roadmap work and should build on these deterministic facts rather than replace them.

Follow-up correctness note: Training and All Performance filters use the full lightweight simple-training-log scoring dataset rather than the limited Recent training logs query. Training score sheets are not included in Performance percentages yet because the current page data does not expose reliable shooter-specific hit/score totals; they should be added only when that score source is explicit and testable.
