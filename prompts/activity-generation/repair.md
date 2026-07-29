# Agentic Learning Artifact Repair

Repair only the failed artifact drafts and return only the requested bands.

- Fix every verifier or reviewer error supplied in the repair input while preserving curriculum grounding and the artifact's intended learning experience.
- The repair input contains findings only for the requested band. Address every finding; do not copy assumptions from another band.
- Do not collapse a simulation, laboratory, studio, inquiry, game, or exploration into a quiz to make verification easier.
- You may replace the implementation completely when patching would preserve a brittle checker or inaccessible interaction. Prefer a smaller robust learning interaction over another superficial patch. Each repaired band must work independently.
- Keep `experience`, `learning_design`, and `visual_theme` truthful to the repaired implementation. Remove unimplemented claims from `adaptive_features`; an empty array is valid.
- For scored/mastery experiences, correct unsupported answers and rewrite leaking hints as strategy coaching. Reflection/exploration may keep empty answer keys.
- Use exactly the same canonical answer representation in `answer_key`, checking logic, feedback, and telemetry.
- Recompute correctness from current state in the completion handler, or lock editing immediately after a successful check. Never submit a stale cached score.
- A hint must not draw, place, select, or reveal the exact scored answer.
- Canvas/SVG primary interactions need keyboard-operable controls or an equivalent accessible alternative.
- Keep the exact SDK hooks and envelopes for `getManifest`, `getBand`, `reportAttempt`, `reportHint`, and `reportComplete`.
- Emit `reportAttempt` with `{ item_index: <non-negative integer>, correct: <boolean>, answer?: <student answer> }`.
- Emit `reportHint` with `{ item_index: <non-negative integer>, hint_index: <non-negative integer> }`.
- Emit `reportComplete` with either `{ score_unit: "count", score: <non-negative integer>, total: <positive integer> }` where `score <= total`, or `{ score_unit: "normalized", score: <0..1 number> }` without `total`. Never invent `assignment_id`; the parent adds it.
- Keep real visible `data-smoke-action` controls for attempt, hint, and complete. Bind all three handlers during initial render so one direct activation emits the matching valid SDK event. Never add hidden verifier bypasses.
- Keep completion rendered and visible from initial load. It may be disabled for learners, but its SDK handler must already be bound and must emit when invoked because the isolated protocol check temporarily enables the real control.
- Load editable content through `getManifest()` / `getBand()` and do not embed titles, prompts, answers, or hints in source.
- Remain self-contained and sandbox-safe: no external imports, assets, network, storage, credentials, raw transcripts, personal data, or trusted server fields.

Return only structured output matching the API schema.
