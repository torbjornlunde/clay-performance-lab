# Roadmap: English Skeet

Status: Accepted tester request

Requested by: Samuel

## Problem

Samuel and shooters at his shooting ground train English Skeet regularly, but the app does not currently offer a discipline-correct English Skeet flow. They therefore cannot use the same structured logging, score history and later analysis that they can use for supported disciplines.

## Product goal

Add English Skeet as a first-class discipline, starting with a focused training version that is fast to use on the range and stores results in a structure that can later support competition logging and analysis.

## First useful version

- English Skeet can be selected when creating a training session.
- The app uses a discipline-correct, fixed scorecard structure rather than a generic post layout.
- Live hit/miss entry is available per target.
- Automatic running score and final total.
- Corrections can be made during and after the round.
- The session is clearly stored as training.
- Results appear in training history and relevant totals without being counted as competition.
- Optional equipment selection continues to work.
- Mobile flow is usable with few taps.

## Before implementation

The exact English Skeet sequence, terminology and scorecard structure must be confirmed with Samuel or another active English Skeet shooter before coding. The app must not guess the discipline structure from Olympic, American or other skeet variants.

## Not required in the first version

- competition administration
- automatic scorecard photo import
- detailed target-path analysis
- shared official course templates
- coach-specific English Skeet reports
- support for every skeet variant in the same PR

## Possible next steps

- competition mode
- scorecard import
- station- and target-specific miss statistics
- comparison across rounds and periods
- shared training score sheets for several English Skeet shooters
- coach report integration
- support for additional skeet variants as separate disciplines where needed

## Acceptance criteria

- Samuel confirms that the scorecard order and terminology are correct.
- A full training round can be logged without using a generic workaround.
- Hit/miss corrections and totals remain correct.
- English Skeet training is not mixed into competition totals.
- Existing disciplines are unaffected.

## Locked decision

English Skeet should first be delivered as a narrow, discipline-correct training flow because that is the verified tester need. Other skeet variants must not be silently treated as the same discipline.
