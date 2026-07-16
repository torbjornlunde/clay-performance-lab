# Roadmap: Mental Performance

Status: Strategic product concept

## Decision

Clay Performance Lab should include a mental performance layer.

This should not be a generic self-help feature. It should be practical, shooting-specific and connected to performance data.

The goal is to help the shooter understand how focus, pressure, routine, fatigue, confidence and reset ability affect results.

## Why this matters

Clay target shooting is not only technical. Many targets are lost because of:

- pressure
- rushed routine
- loss of focus
- overthinking
- poor reset after a miss
- uncertainty on plan
- competition nerves
- fatigue over a long day
- frustration after bad stands
- change in confidence

A strong app should help the shooter see these patterns without pretending to be a psychologist.

## Product principle

Mental performance data should be lightweight.

The app must not make the user fill out a long mental questionnaire after every session. It should use quick tags, small reflections and optional notes.

The best first version is:

- fast to log
- optional
- linked to sessions, stands, misses or rounds
- useful for AI analysis
- honest about uncertainty

## First useful version

The first version should support simple mental tags before and after a session.

### Before session / competition

Optional quick check-in:

- energy: low / normal / high
- focus: low / normal / high
- nerves / pressure: low / medium / high
- confidence: low / normal / high
- main intention for the session

Example:

`Today’s focus: stay calm after a miss and commit to the plan on report pairs.`

### After session / competition

Optional quick reflection:

- mental performance: poor / ok / good
- pressure handling: poor / ok / good
- routine consistency: poor / ok / good
- reset after miss: poor / ok / good
- one thing that worked
- one thing to improve

Example:

`I lost focus after stand 4. Good start, but rushed after two misses.`

## Miss-level mental tags

When registering or reviewing a miss, the app may allow optional mental/context tags:

- rushed shot
- no clear plan
- lost focus
- overthinking
- hesitation
- pressure/nerves
- frustration after previous miss
- poor pickup
- changed plan too late
- did not trust the line
- fatigue
- unknown

These should be optional and quick. The user should not be forced to explain every miss.

## Performance Report integration

Mental performance should appear in Performance Report only when enough data exists.

Possible insights:

- `Your competition hit rate drops most after the first miss in a round.`
- `You often mark rushed shot on second bird in report pairs.`
- `Your best competition scores happen when pre-session confidence is normal/high and routine consistency is marked good.`
- `You record more mental mistakes late in long competition days.`

The app must be careful not to overclaim causation.

Better wording:

`This pattern suggests pressure or reset routine may be involved.`

Bad wording:

`You miss because you are mentally weak.`

## AI Shooting Assistant integration

The AI assistant can help the shooter reflect and prepare.

Examples:

- `Why do I collapse after one bad stand?`
- `Make me a simple reset routine after a miss.`
- `What should I focus on mentally before tomorrow’s competition?`
- `Compare my mental notes with my score trend.`
- `What should I ask a coach about if I lose focus in report pairs?`

The AI should stay practical and shooting-specific. It should not act as a therapist or diagnose mental health conditions.

## Training routines

The app may later include mental routines such as:

- pre-shot routine checklist
- reset after miss
- between-stand reset
- competition morning checklist
- pressure simulation training
- post-round reflection
- focus cue library

These should be customizable by the shooter.

Example reset routine:

1. Accept the miss.
2. One breath.
3. Identify only one correction.
4. Commit to the next target.
5. Do not replay the miss during the next call.

## Competition context

Mental performance is especially valuable in competitions.

The app should later analyze:

- first stand versus later stands
- score after a miss
- final stands / closing pressure
- shoot-off / final pressure where logged
- training versus competition difference
- long competition days
- multiple events in one week
- weather / fatigue / travel context where available

## Data model ideas

Possible fields:

- session mental check-in
- session mental reflection
- pressure level
- focus level
- confidence level
- energy level
- routine consistency
- reset quality
- mental tag linked to miss
- mental tag linked to stand/post/round
- free-text mental note
- source: manual, AI prompt, coach note
- user confirmed / edited flag

## Coach Report integration

Coach Report can include mental performance notes if the shooter chooses to share them.

The shooter should control whether mental notes are included.

Potential coach report section:

- pressure/routine notes from selected period
- repeated mental tags
- difference between training and competition
- examples of stands or sessions where mental notes may matter
- questions for coach discussion

Mental notes may be sensitive. They should not be shared by default.

## Privacy and trust

Mental performance data is more personal than normal score data.

Rules:

- optional by default
- not required for core logging
- not shared without explicit user choice
- visible to the user as their own notes
- coach only sees it if the shooter includes it
- AI must not infer private mental-health conditions
- app must not label the shooter negatively

## What this is not

The feature is not:

- therapy
- medical advice
- diagnosis
- a replacement for sports psychologist or coach
- a long journaling system forced into every session
- a way to shame the shooter

## Product value

Mental performance can make Clay Performance Lab feel more complete.

Score data tells what happened.
Target data tells what kind of target was missed.
Mental data can help explain what state the shooter was in.

Together, this gives AI a better foundation for useful analysis.

## First MVP

The MVP should include:

- optional pre-session mental check-in
- optional post-session mental reflection
- optional miss-level mental tags
- ability to include/exclude mental notes in Coach Report
- simple Performance Report mention only when data is meaningful
- AI assistant can discuss mental notes with caution

## Later versions

Later, this may expand to:

- personalized pre-shot routine builder
- reset routine reminders
- competition pressure mode
- mental trend over time
- voice note after session
- coach comments on mental routines
- integration with Performance Report training focus
- pressure simulation training plans

## Locked decisions

1. Mental performance should be part of the product, but as practical shooting-performance support, not therapy.
2. Mental logging must be optional and lightweight.
3. Mental data should be linked to shooting context: session, round, stand, miss or competition.
4. AI can analyze mental patterns, but must not diagnose mental health or overclaim causation.
5. Mental notes are sensitive and should not be shared with coaches or others unless the shooter explicitly chooses to include them.
6. First version should use quick check-ins, reflections and tags rather than long forms.
