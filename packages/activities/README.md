# packages/activities

Area C: Activity Generation & Quality (owned by Androso) — schema/validator/player/rubric, shared by `apps/web` and `apps/worker`.

**What this package receives (Isaac's side of the contract — see `docs/area-bc-contract.md`):**

- `lesson_state` (from `@kobi/ai-core`) — topic, objective guess, key terms, confidence, evidence.
- `CurriculumMatch[]` (from `@kobi/curriculum`'s `retrieveCurriculumMatches()`) — top-3 curriculum chunks grounding the current lesson segment.
- The activity repository (`activities` table, not yet built) — for the reuse-vs-generate decision.

**Expected usage flow:** ground a planner call in `lesson_state` + `CurriculumMatch[]`, check the repository for a reusable match first, generate new candidates only when nothing fits, verify each candidate against a rubric, and produce 3 ranked candidates for the teacher shortlist.

The actual activity output shape (quiz/cloze/match_order or otherwise), the schema, the validator, the generic player, and the verifier rubric are Androso's design calls — not prescribed here. `docs/product-spec.md` documents the reference activity families (quiz, vocab_cloze, match & order) from the original spec as a starting reference, and D9 in the same doc notes a post-MVP `interactive_artifact` direction he's exploring — both are his to finalize.

Status: not yet implemented — this README exists to record what Androso's code will receive, not what it should output.
