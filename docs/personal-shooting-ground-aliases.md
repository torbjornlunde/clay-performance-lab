# Personal shooting ground aliases

Personal shooting ground aliases let each signed-in user group different names that refer to the same shooting ground.

- Alias groups are user-owned and do not affect other users.
- Original source names on imported results, manual competition sessions and training logs are preserved.
- Duplicate suggestions are advisory only and require explicit user approval before anything is merged.
- The app stores a nullable personal canonical shooting ground reference beside the original text; it does not rewrite historical venue, location or ground text.
- There is no admin or global shooting ground merge catalog in this implementation.
- All app UI for this feature must remain English-only.

## Performance drilldown cleanup

The Performance page lets users open a shooting ground summary to inspect the competition sessions grouped under that ground. The detail view shows the original source or imported ground names, result dates, disciplines and scores before the user changes anything.

From that drilldown, a user can move one competition session at a time to an existing personal canonical shooting ground or create a new personal shooting ground for that one assignment. This does not create a broad alias automatically and does not rewrite the original `sessions.shooting_ground` value.

Users can still use Settings > Clean up shooting grounds for broader personal alias cleanup when multiple source names clearly refer to the same place.
