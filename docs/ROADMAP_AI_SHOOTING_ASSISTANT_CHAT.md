# Roadmap: AI Shooting Assistant Chat

Status: Strategic product concept

## Decision

Clay Performance Lab should include an in-app AI chat assistant specialized for shotgun and clay target shooting.

The assistant should not be a generic chatbot. It should be a domain-specific shooting assistant that can use:

- the shooter’s own logged data
- Performance Report findings
- discipline and variant context
- target definitions
- equipment data where available
- reviewed scorecards and imports
- trusted shooting knowledge sources
- clear safety and confidence guardrails

The assistant should help the shooter understand patterns, prepare training, ask better questions, and know when a real coach is needed.

## Positioning

The feature should feel like:

`A clay shooting performance assistant inside the app.`

Not:

`A generic AI chat box with shooting words added.`

## Why this matters

A Performance Report gives the shooter a prepared summary. Chat lets the shooter go deeper.

Examples:

- `Why does the app say I should train second bird in report pairs?`
- `What should I focus on next session?`
- `Compare my last 5 competitions with my last 5 trainings.`
- `What data do you need to give me a better analysis?`
- `Make me a 45 minute training plan for long crossers.`
- `Explain this pattern in simple terms.`
- `What should I ask a coach to look at?`

This can make the app feel much more intelligent and personal.

## Fine-tuning strategy

The long-term goal can include actual fine-tuning or domain-specific model adaptation, but first versions should probably use a safer and more flexible approach:

1. strong system instructions
2. structured app data
3. retrieval from trusted shooting knowledge
4. discipline-specific rules
5. structured tool calls to fetch user stats
6. safety and confidence guardrails
7. logged user feedback on answer usefulness

Actual fine-tuning should come later when we have enough high-quality examples of good and bad answers.

Reason: a poorly fine-tuned model can become confidently wrong. For this domain, grounding and data quality matter more than calling it fine-tuned early.

## Knowledge grounding

The assistant should be grounded in approved content, not random internet text.

Potential trusted sources later:

- app’s own discipline definitions and rule-set versions
- verified coaching notes written for the app
- user-approved coach content
- structured target taxonomy
- app documentation
- verified drill library
- trusted videos or written material where licensing allows linking or summarizing

The assistant should know when it is using general clay-shooting principles versus the shooter’s own data.

## Personal data access

The assistant should be able to answer questions using the shooter’s data, but only within permission boundaries.

Possible data it may use:

- recent sessions
- selected date range
- training versus competition split
- target misses
- Performance Report conclusions
- equipment used
- scorecard import results
- shooter notes
- coach feedback if explicitly shared

It should not access another shooter’s data unless sharing permissions allow it.

## First useful version

The first version of AI chat does not need to answer everything.

Minimum useful scope:

- explain the current Performance Report
- answer questions about the shooter’s own recent data
- suggest a practical next training session
- identify what data is missing for better analysis
- help prepare a coach review summary
- explain uncertainty and sample size
- avoid unsupported technique diagnosis

Example answer style:

`Your largest repeated loss is the second bird in report pairs. The pattern is strongest on longer left-to-right targets. The app can suggest training this pattern, but it cannot tell from score data alone whether the cause is timing, hold point, line, visual pickup or gun movement. A coach or video would help confirm the cause.`

## Later capabilities

Later versions may support:

- voice chat after a session
- automatic follow-up questions after bad rounds
- drill generation based on available targets at the range
- integration with coach comments
- comparison between guns, chokes and ammunition
- weather and lens discussion
- pattern board interpretation
- ShotKam/video discussion where available
- direct conversation around a scorecard photo or target-sign photo
- multilingual support for Norwegian and English shooting terms

## Example chat modes

### Ask about my data

`Why am I losing targets in competition but not training?`

The assistant should compare training and competition data, then explain whether the pattern is strong or weak.

### Build my next training

`Make a short training plan based on my last month.`

The assistant should create a focused plan from the Performance Report and known weak areas.

### Prepare for coach

`What should I send to Ed before a lesson?`

The assistant should create a coach-ready summary and recommend relevant sessions / patterns to include.

### Understand a discipline

`How should I interpret station 4 misses in skeet?`

The assistant should explain based on the exact skeet variant where possible.

## UI concept

The assistant should not only be a full-screen chat buried in the menu.

Possible entry points:

- from Performance Report: `Ask AI about this`
- from a weak-area card: `Why this focus?`
- from session detail: `Analyze this session`
- from import review: `What data is missing?`
- from coach report: `Prepare coach summary`
- from dashboard: `What should I train next?`

The user should be able to chat from context, not only start from a blank box.

## Structured output and actions

The chat should sometimes return actions, not only text.

Examples:

- create suggested training plan
- save a training focus
- mark insight as useful / not useful
- open related sessions
- generate coach summary
- ask user to add missing target details

AI responses should be stored or summarized only where useful and with clear privacy handling.

## Guardrails

The AI assistant must not:

- present itself as a replacement for a qualified coach
- diagnose technique as fact from score data alone
- invent data not present in the app
- tell users to ignore safety rules
- give unsafe firearm handling advice
- claim a paid coach recommendation is neutral if payment affects placement
- expose another user’s data without permission
- make high-confidence claims from low sample sizes
- mix discipline variants without warning

## Safety and responsibility

The assistant can discuss training, performance, routines, data interpretation and what to ask a coach.

It should avoid detailed weapon modification guidance or unsafe handling. Equipment discussions should remain at a sports-performance and safety-conscious level.

## Product value

The chat assistant can become one of the clearest signs that Clay Performance Lab is AI-native:

- the report tells the user what matters
- the chat helps the user understand and act on it
- the coach report helps a human coach go deeper

Together, this creates a stronger product than ordinary score logging.

## Locked decisions

1. The app should eventually include an AI chat assistant specialized for clay target and shotgun shooting.
2. The assistant should be grounded in structured app data and trusted shooting knowledge, not generic unsupported answers.
3. First version should focus on explaining Performance Report, answering data questions and suggesting next training.
4. Actual fine-tuning should be considered later, after enough high-quality training/evaluation examples exist.
5. The assistant must show uncertainty and recommend a human coach when the likely cause cannot be determined from app data.
