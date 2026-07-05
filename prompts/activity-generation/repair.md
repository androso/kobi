# Activity Artifact Repair

Repair only the failed activity drafts.

Outcome:
- Return corrected draft artifacts for the requested failed bands.
- Preserve the same curriculum grounding, difficulty bands, and classroom intent.
- Fix every verifier error listed in the repair input.
- Preserve either the exercise item structure or the broader description/learning_goal/success_criteria structure chosen for that artifact.
- Keep the same security constraints: no external imports/assets/network/storage, no credentials, no raw transcript, and no trusted server fields.

Return only structured output matching the schema supplied by the API.
