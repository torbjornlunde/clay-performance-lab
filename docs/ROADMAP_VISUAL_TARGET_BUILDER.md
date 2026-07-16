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

The first attempt should be **2.5D**, not flat 2D only. If that does not describe real targets well enough, the fallback should be a simplified 3D target builder where the user can rotate the shooter/viewpoint and draw the approximate target line.

## Core idea

A clay target can often be described by five practical dimensions:

1. **Speed** – slow, medium, fast, or a numeric/relative slider.
2. **Angle** – crossing/quartering/incoming/outgoing/teal-style angle, expressed visually.
3. **Distance** – close, medium, far, or approximate meter range.
4. **Position relative to shooter** – where the target starts, travels and appears in the shooter’s world.
5. **Height / elevation** – below feet, low, eye level, high, rising, flat or falling.

The fourth and fifth points are the hard ones. The app should create a visual helper for them.

## Visual model: 2.5D first

The first target builder should use a 2.5D model:

- shooter position as the reference point
- field of view in front of / around the shooter
- left/right/front/back sectors
- distance rings
- height/elevation control
- start point and end point of target flight
- direction arrow / flight path
- pickup point marker
- break point marker
- optional hold point marker later
- speed control
- distance estimate
- optional notes

The user should be able to drag a start point and end point, instead of choosing only from text dropdowns.

The app can then generate a structured target description such as:

`Long left-to-right crosser, medium-fast, approx. 30–40 m, slightly falling.`

or

`Low quartering incoming target from front-right, approx. 15–20 m, starts below shooter level and breaks near center.`

## Why flat 2D is not enough

A pure 2D top-down drawing may fail for targets that are defined by elevation.

Example:

`The target comes 3 meters below the shooter’s feet and travels diagonally toward the shooter and slightly right.`

A flat 2D view can show left/right and toward/away, but it cannot clearly show that the target starts far below the shooter or how it rises/falls. This is why v1 should be 2.5D.

## Possible 2.5D UI

The 2.5D builder can use two linked views:

1. **Top / shooter-world view**
   - left/right/front/back relation
   - start and end position
   - direction of travel
   - distance rings

2. **Side / elevation view**
   - below feet / low / eye level / high
   - rising / flat / falling
   - start height and break height

The user edits a rough path without needing precise geometry. The app converts it to structured fields.

Alternative v1 UI:

- one main shooter-perspective map
- height slider for start and end
- simple buttons: below / low / eye level / high
- pickup point and break point draggable on the path

## 3D fallback concept

If the 2.5D version is still not good enough, the app should move toward a simplified 3D target builder.

3D concept:

1. User rotates around the shooter or changes viewing angle until the view matches how the target felt.
2. User draws a rough line through the air where the clay travels.
3. User marks:
   - start / launch area if known
   - pickup point
   - hold point if relevant
   - break point
   - optional end point
4. User sets speed and approximate distance.
5. AI/app converts the rough drawing into structured target data.
6. User reviews and saves.

This should still be approximate and fast. It should not become a technical CAD tool.

## Key target points

The builder should eventually distinguish several points because they matter for training and coach review:

- **Start / visible start** – where the target first appears or where the shooter perceives it.
- **Pickup point** – where the shooter first visually picks up the target.
- **Hold point** – where the gun starts or where the shooter wants to hold before movement.
- **Break point** – where the shooter intends to kill or actually kills/misses the target.
- **End point** – where the target exits or disappears, if useful.

MVP can start with pickup and break point. Hold point can come later because it is more technique-dependent and may require coach context.

## Interaction concept

### Fast mode

For quick logging:

1. Choose target/pair.
2. Draw or drag rough target path.
3. Set speed.
4. Set approximate distance.
5. Set height/elevation roughly.
6. Mark pickup and break point if useful.
7. Save.

This should take seconds, not minutes.

### Advanced mode

For detailed setup, optional fields can include:

- target type / presentation family
- height / rising / falling / flat
- visibility / background
- difficulty
- machine/source letter where relevant
- pickup point
- hold point
- break point
- notes
- uncertainty flag

Advanced fields must be optional and collapsed by default.

## Pair builder

For pairs, the user should be able to define:

- pair type: report, simo, on-report, following, etc.
- first bird path
- second bird path
- pickup and break point for each bird where useful
- whether the miss was on first or second bird
- whether the second bird is only visible after the first shot

The UI should make it easy to copy target paths and adjust only what changes.

## AI-assisted target description

The visual builder should work together with AI.

Possible inputs:

- voice: `Fast left-to-right crosser from the trees, about 35 meters.`
- text: `Rabbit from left, close, slow.`
- voice/text: `It comes from below my feet, diagonally toward me and slightly right, and I break it just right of center.`
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
- height / elevation start and end category where known
- rising / flat / falling
- pickup point coordinate / category
- break point coordinate / category
- hold point coordinate / category where recorded
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
- Do not require full 3D precision for normal logging.

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

- 2.5D visual target path editor from shooter perspective
- speed control
- distance control
- height/elevation control
- direction/path auto-label
- pickup point marker
- break point marker
- optional note
- save to target definition
- edit later
- use for missed targets first

Do not start with a complex 3D editor. Try 2.5D first. If 2.5D cannot represent enough real targets, move to the simplified 3D fallback.

## Later versions

Later, this may expand to:

- simplified 3D view with rotatable shooter/viewpoint
- draw target flight line in 3D-like space
- mark pickup point, hold point and break point directly on the flight path
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
3. The core target dimensions are speed, angle, distance, position relative to the shooter and height/elevation.
4. The app should support partial target detail and should not force full course setup before logging a competition.
5. First attempt should be 2.5D, not flat 2D only.
6. If 2.5D is not expressive enough, the fallback is a simplified 3D target builder where the user rotates the shooter/viewpoint and draws the approximate clay flight line.
7. Pickup point and break point should be supported early; hold point should be planned but can come later.
8. AI may help draft target descriptions, but the user must review and confirm before saving.
