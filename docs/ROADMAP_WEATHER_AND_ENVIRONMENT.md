# Roadmap: Weather and environmental context

Status: Planned product workstream

Last updated: 19 July 2026

## Decision

Clay Performance Lab should support weather and environmental context as optional structured session data.

Weather must never be required to log a session, but when available it can improve:

- retrospective analysis
- competition and training context
- target/presentation interpretation
- equipment and lens decisions
- AI-supported pattern analysis

The app must not overstate causation. A result that happened in strong wind does not prove that wind caused the misses.

## Product principles

1. Weather is optional and should be captured with minimal friction.
2. Automatic capture is preferred when location and time are available.
3. The app must store provenance so users know whether data came from an external provider, device input or manual editing.
4. Weather should be timestamped, because conditions can change during a long competition.
5. Session-level weather is useful, but the architecture should later allow round/post/stand-level weather snapshots when needed.
6. Historical weather backfill may be used when reliable data is available for the session location and time.
7. Offline logging must not fail because weather cannot be fetched. Time/location can be retained and weather resolved later when appropriate.
8. AI and statistics must treat weather as context/correlation, not automatic proof of cause.

## First useful version

### Session weather snapshot

Store a weather snapshot for a Competition or Training session when the user chooses to enable it.

Useful fields include:

- observed time
- location coordinates or resolved shooting ground location
- temperature
- wind speed
- wind gust
- wind direction
- precipitation / rain state
- humidity
- atmospheric pressure where available
- cloud cover
- visibility where available
- general condition description
- weather provider/source
- captured automatically vs manually entered

The UI should show a compact summary and keep advanced details collapsed.

Example:

`12°C · W 7 m/s, gusts 12 · Light rain`

## Wind-specific shooting context

Wind is particularly relevant for clay target shooting and should later support more than a generic number.

Potential structured context:

- wind direction relative to the shooting ground
- wind direction relative to a target/presentation when that geometry is known
- headwind / tailwind / left-to-right / right-to-left contextual labels
- gustiness / variability
- whether conditions changed significantly during the session

Do not fabricate target-relative wind if the app does not know the target direction or ground orientation.

## Time-varying weather

Long competitions can have materially different conditions between early and late rounds.

The data model should eventually allow:

- session start weather
- additional weather snapshots during the event
- optional association with a round/course/post time range

This should not require manual weather logging at every post.

A practical later approach is to capture timestamps during scoring and resolve weather observations for those time windows when provider data allows it.

## Shooting ground location

Preferred location hierarchy:

1. canonical personal/shared shooting ground coordinates when known
2. event/competition coordinates when known
3. device location with explicit permission
4. manually selected location
5. no weather data

Location permission must not be mandatory for using the app.

## Historical backfill

For imported historical Competition results, the app may later offer weather enrichment if:

- competition date is known
- approximate time is known or can be represented honestly as uncertain
- shooting ground location is known
- a provider supports historical observations

Do not pretend that one daily weather value represents exact conditions at the time of shooting if the time is unknown.

## Performance integration

Weather can later be used in analysis such as:

- performance in strong wind vs calm conditions
- performance in rain
- late-session deterioration when conditions worsened
- target-type patterns under wind exposure
- equipment/lens context

Minimum sample sizes and confidence are required.

Good wording:

`Your recorded performance has been lower in sessions with strong wind, but the sample is small and competition difficulty may also differ.`

Bad wording:

`Wind causes you to miss crossers.`

## Equipment and shooting glasses integration

Weather context may later support:

- lens recommendations among lenses the user owns
- ammunition/choke analysis where environmental context is relevant
- equipment comparison with environmental differences visible

Weather must never be used to make an equipment comparison look more certain than the data supports.

## AI integration

AI may use weather as one input alongside:

- discipline
- target definitions
- miss details
- equipment
- session type
- time/order in the session
- mental/fatigue context

AI must distinguish:

- observed fact
- statistical association
- shooter note/assumption
- AI hypothesis

## Notifications and preparation later

Optional user-defined features may later include:

- weather forecast for a planned competition/training session
- wind/rain preparation reminder
- lens/equipment preparation suggestion

These should be opt-in and should not become generic engagement notifications.

## Not in first version

Do not include initially:

- mandatory GPS permission
- constant background location tracking
- weather logging at every target
- automatic claims that weather caused a miss
- complex microclimate modelling
- paid weather provider dependency before the product need is proven

## Roadmap IDs

- WEATHER-01: optional session weather snapshot
- WEATHER-02: shooting ground coordinates / location resolution
- WEATHER-03: historical weather enrichment
- WEATHER-04: time-varying weather snapshots during long sessions
- WEATHER-05: target-relative wind context where geometry is known
- WEATHER-06: Performance Report weather correlations with confidence
- WEATHER-07: shooting-glasses integration
- WEATHER-08: optional forecast/preparation reminders
