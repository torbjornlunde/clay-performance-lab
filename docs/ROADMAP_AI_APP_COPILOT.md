# Roadmap: AI App Copilot

Status: Strategic product concept

## Decision

Clay Performance Lab should eventually include an AI App Copilot that lets the user say or write what they want to do in the app, and then helps set it up.

This is different from the AI Shooting Assistant Chat:

- **AI Shooting Assistant Chat** explains performance, training, patterns and shooting-related questions.
- **AI App Copilot** helps the user operate the app and prepare workflows.

The Copilot should reduce friction by turning natural language into app actions, but it must show a preview and require confirmation before important data is saved, shared, published or changed.

## Product idea

The user should be able to write or speak things like:

- `Create a 100 target leirduesti training with Simon, Mads and Samuel.`
- `Set up a Compak Sporting training with 3 squads and 25 targets per course.`
- `Make a Performance Report for my last 5 competitions.`
- `Find the sessions where I missed most rabbits.`
- `Prepare a coach report for Ed from the last month.`
- `Create a Jegertrap session and start me on stand 3.`
- `Add my Blaser F3 81 cm barrel setup and call it F3 long barrels.`
- `Show me my best and worst stations in skeet this season.`

The app should then create a draft setup or navigate to the right place with fields filled in.

## Why this matters

As the app becomes more powerful, it also becomes more complex. The AI App Copilot can make advanced functions accessible without forcing users through many menus.

This is especially valuable for:

- new users
- mobile use at the shooting range
- users who want quick setup
- users who do not know where a feature lives
- advanced reports with many options
- voice input when typing is inconvenient

## First useful version

The first useful version should be narrow and safe.

Suggested scope:

- create a draft training session
- create a draft competition/result-only session
- create a draft Performance Report with chosen range
- create a draft Coach Report preview
- search the user’s own sessions
- suggest missing fields needed to complete an action
- navigate to the right screen with fields prefilled

The first version should not perform destructive or public actions automatically.

## Interaction model

The Copilot should follow this flow:

1. User writes or speaks a request.
2. AI interprets the intent.
3. AI identifies missing required fields.
4. AI asks only necessary follow-up questions.
5. AI creates a draft action.
6. App shows a clear preview.
7. User confirms or edits.
8. App performs the action through normal app functions.
9. App shows success and offers undo where appropriate.

Example:

User: `Create a leirduesti training for tomorrow with Simon and Mads, 4 posts and 25 targets per post.`

Copilot preview:

- Type: Training
- Discipline: Leirduesti
- Date: Tomorrow
- Shooters: Torbjørn, Simon, Mads
- Posts: 4
- Targets per post: 25
- Total: 100 targets

Actions:

- `Create training`
- `Edit details`
- `Cancel`

## Confirmation rules

The Copilot may draft actions freely, but must require confirmation for:

- creating sessions
- changing saved data
- deleting data
- publishing shared setups
- sharing reports
- sending anything to a coach
- applying imported scorecard data
- linking or claiming another shooter’s result
- changing equipment history
- changing privacy or permissions

The Copilot should never silently write important data.

## Voice support

Voice can become important because users may be at the range, wearing gloves, holding equipment or wanting quick entry.

Possible voice examples:

- `Start a training score sheet for five shooters.`
- `Add Simon and Mads.`
- `Next shooter missed the second bird.`
- `Make a report for this session later.`

Voice input must still obey the same confirmation rules.

## Architecture concept

The Copilot should not directly mutate the database from free text.

Preferred architecture:

1. natural-language input
2. intent classification
3. structured action schema
4. validation against app rules
5. missing-field resolution
6. preview UI
7. user confirmation
8. normal server-side action / RPC / form submission
9. audit trail for AI-assisted action

The AI should produce structured actions, not arbitrary code or database writes.

Example action schema:

```json
{
  "intent": "create_training_session",
  "discipline": "leirduesti",
  "date": "2026-07-04",
  "shooters": ["Torbjørn", "Simon", "Mads"],
  "posts": 4,
  "targets_per_post": 25,
  "requires_confirmation": true,
  "missing_fields": []
}
```

## App areas where Copilot can help

### Session creation

- create training
- create competition
- create result-only entry
- select discipline
- infer typical defaults from user history

### Reports

- create Performance Report
- create Coach Report preview
- choose period or sessions
- explain what data will be included

### Search and navigation

- find sessions
- find competition results
- find weak target categories
- open equipment history
- open last imported scorecard

### Equipment setup

- add gun
- add barrel setup
- add ammo
- add choke set
- set default equipment

### Training planning

- create a suggested training plan from Performance Report
- turn AI training suggestions into a checklist
- save training focus for next session

## Relationship to AI Shooting Assistant Chat

The two features should work together.

Example:

1. Performance Report finds weak second-bird report pairs.
2. User asks AI chat: `How should I train this?`
3. AI suggests a drill.
4. User says: `Set that up for Saturday with Simon.`
5. AI App Copilot creates a draft training session.
6. User reviews and confirms.

This creates a complete loop:

analysis -> explanation -> training plan -> app setup -> logged results -> new analysis.

## Guardrails

- Always preview important actions before save.
- Never delete, publish, share or send without explicit confirmation.
- Do not infer people or private data too aggressively.
- Do not create duplicate sessions without warning.
- Do not override manually entered data silently.
- Do not make hidden privacy changes.
- Do not bypass normal validation or server-side permissions.
- Keep an audit trail for AI-assisted changes.
- Be clear when voice transcription may be uncertain.

## Launch priority

This should probably come after the core Performance Report and basic AI Shooting Assistant Chat, because the Copilot needs stable app actions to call.

However, the architecture should be considered early so future forms and workflows can support AI-assisted prefill and confirmation.

## Locked decisions

1. Clay Performance Lab should eventually support natural-language app control by text and voice.
2. The AI App Copilot should create drafts, previews and prefilled flows, not silently change important data.
3. All important data changes require user confirmation.
4. The Copilot must use structured action schemas and normal app validation.
5. The long-term loop should be: AI analyzes performance, user asks follow-up, AI suggests training, Copilot sets it up, user logs it, AI learns from new data.
