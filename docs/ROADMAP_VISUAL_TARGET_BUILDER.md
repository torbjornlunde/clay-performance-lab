# Roadmap: Visual Target Builder

Status: Product concept from real competition-week friction

## Origin

During NM week, detailed logging became too heavy in real use. The shooter had two NM events, four Khan Arms Cup events and twelve press/training rounds. In that context it was realistic to log only the competition, upload score sheets and register some training as simple training entries.

Trying to set up every target and pair during competition was too cumbersome. Existing dropdowns did not describe targets well enough, and adding Leirdue.net links afterward added friction.

This is a critical product lesson: detailed target data is valuable, but the app must not require heavy target setup at the wrong moment.

## Decision

Clay Performance Lab needs a simpler and more visual way to describe clay targets.

The product should move away from relying mainly on dropdowns for target descriptions. Dropdowns can still exist, but they are not enough for real clay target presentation.

The app should support a **Visual Target Builder**: a fast, mobile-friendly way to describe a clay target based on its movement and position relative to the shooter.

## Core idea

A clay target can often be described by four practical dimensions:

1. **Speed** – slow, medium, fast, or a numeric/relative slider.
2. **Angle** – crossing/quartering/incoming/outgoing/teal-style angle, expressed visually.
3. **Distance** – close, medium, far, or approximate meter range.
4. **Position relative to shooter** – where the target starts, travels and appears in the shooter’s world.

The fourth point is the hard one. The app should create a visual helper for it.

## Visual model

The target builder should show the shooter’s perspective:

- shooter position at bottom/center
- field of view in front of the shooter
- left/right/front sectors
- distance rings
- optional height layer
- start point and end point of target flight
- direction arrow / flight path
- speed control
- distance estimate
- optional notes

The user should be able to drag a start point and end point, instead of choosing only from text dropdowns.

The app can then generate a structured target description such as:

`Long left-to-right crosser, medium-fast, approx. 30–40 m, slightly falling.`

or

`Quartering away from right, fast, far, second bird in report pair.`

## Interaction concept

### Fast mode

For quick logging:

1. Choose target/pair.
2. Drag target path on a simple field map.
3. Set speed.
4. Set approximate distance.
5. Save.

This should take seconds, not minutes.

### Advanced mode

For detailed setup, optional fields can include:

- target type / presentation family
- height / rising / falling / flat
- visibility / background
- difficulty
- machine/source letter where relevant
- notes
- uncertainty flag

Advanced fields must be optional and collapsed by default.

## Pair builder

For pairs, the user should be able to define:

- pair type: report, simo, on-report, following, etc.
- first bird path
- second bird path
- whether the miss was on first or second bird
- whether the second bird is only visible after the first shot

The UI should make it easy to copy target paths and adjust only what changes.

## AI-assisted target description

The visual builder should work together with AI.

Possible inputs:

- voice: `Fast left-to-right crosser from the trees, about 35 meters.`
- text: `Rabbit from left, close, slow.`
- photo of stand/post sign
- photo of the range view
- imported/shared competition setup
- previous similar target saved by another shooter

AI should convert the description into a draft target path and structured fields, then show it for review.

The user must confirm before saving.

## Progressive detail principle

The app should not require all target definitions before logging a competition.

Recommended flow:

1. Log result / score sheet first.
2. Attach Leirdue.net link at creation or import stage if available.
3. Add detailed target definitions only when useful.
4. Let the shooter add target details later from misses or important stands.
5. Let shared competition setups fill details when another user has already done the work.

The app should support partial detail:

- only missed targets
- only difficult stands
- only one course
- only target family without exact movement
- full setup when the user actually has time

Partial detail is better than blocking the user or causing them to abandon logging.

## Competition-week mode

For busy competition weeks, the app should offer a low-friction mode:

- create event quickly
- upload score sheet
- add Leirdue.net link immediately or later
- mark detailed target setup as optional
- remind the user later to enrich the most important misses
- allow batch import / batch linking where possible

The user should never feel forced to build every target while tired between events.

## Leirdue.net link friction

The flow should allow Leirdue.net link entry earlier and more naturally:

- during competition creation
- during score sheet import
- from session detail
- as paste-from-clipboard suggestion
- with duplicate detection

The user should not need to remember to go back through an awkward edit path after the competition.

## Data model implications

The target builder should store structured values, not just a drawing:

- start sector / coordinate
- end sector / coordinate
- direction vector
- distance estimate or category
- speed category or slider value
- height / elevation category where known
- target family derived from path
- uncertainty flag
- free-text note
- source: manual, AI draft, imported, shared setup, photo-derived
- user confirmed / edited flags

This allows future AI analysis to use the data reliably.

## UI guardrails

- Mobile-first.
- One-thumb friendly where possible.
- Few required fields.
- Advanced fields hidden until needed.
- Works offline for draft creation.
- Clear uncertainty state.
- Easy to edit later.
- Do not force exactness when the shooter only knows approximate presentation.

## Product value

This can become a unique Clay Performance Lab advantage.

Most apps can ask for a target type. Few can let the shooter describe the real-world presentation visually and turn it into structured analysis data.

This supports:

- better Performance Report
- better AI Shooting Assistant
- better Coach Report
- better shared competition setups
- better training recommendations
- better long-term target taxonomy

## First useful version

The MVP should include:

- visual target path editor from shooter perspective
- speed control
- distance control
- direction/path auto-label
- optional note
- save to target definition
- edit later
- use for missed targets first

Do not start with a complex 3D editor. A simple 2D shooter-perspective map is enough for v1.

## Later versions

Later, this may expand to:

- 3D height visualization
- range-view photo overlay
- AI from voice/text to target path
- AI from video or ShotKam
- reusable similar-target suggestions
- club/shared target libraries
- coach annotations
- comparison between target presentations

## Locked decisions

1. Detailed target setup must become easier and more visual.
2. Dropdowns alone are not enough to describe real clay target presentations.
3. The four core target dimensions are speed, angle, distance and position relative to the shooter.
4. The app should support partial target detail and should not force full course setup before logging a competition.
5. A simple 2D visual target builder is preferred before attempting complex 3D or video-based solutions.
6. AI may help draft target descriptions, but the user must review and confirm before saving.
