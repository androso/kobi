# Activity Artifact Repair

Repair only the failed activity drafts.

Outcome:
- Return corrected draft artifacts for the requested failed bands.
- Preserve the same curriculum grounding, difficulty bands, shared mechanic, and classroom intent.
- Fix every verifier error listed in the repair input.
- Keep all required SDK hooks (`getManifest`, `getBand`, `reportAttempt`, `reportHint`, `reportComplete`) and `score_unit`.
- Ensure the bundle is valid HTML/CSS/JS that loads editable content via `getManifest()`/`getBand()` without embedding editable answer keys or prompts in source.
- Ensure the set shares exactly one family and snake_case mechanic slug (`mechanic`).
- Keep the interaction as an active skill-practice mini-app. Do not "fix" a failed draft by collapsing it into multi-option Q&A.
- Keep the same security constraints: no external imports/assets/network/storage, no credentials, no raw transcript, and no trusted server fields.
Return only structured output matching the schema supplied by the API.
