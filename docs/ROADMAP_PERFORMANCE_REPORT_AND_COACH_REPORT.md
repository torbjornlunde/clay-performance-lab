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
