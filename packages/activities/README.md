# packages/activities

Area C: Activity Generation & Quality (owned by Androso) — artifact manifest schema, verifier, sandbox SDK, and rubric side shared by `apps/web` and `apps/worker`.

**Contract:** `lesson_state` + curriculum chunks + repository → 3 verified candidate `ActivityArtifact`s.

Gate 0 decision on 2026-07-04: v0 uses self-contained HTML/CSS/JS mini-app artifacts plus structured manifests. There are no legacy JSON activities or consumers, so no JSON migration path is needed.

**What this package receives (Isaac's side of the contract — see `docs/area-bc-contract.md`):**

- `lesson_state` (from `@kobi/ai-core`) — topic, objective guess, key terms, confidence, evidence.
- `CurriculumMatch[]` (from `@kobi/curriculum`'s `retrieveCurriculumMatches()`) — top-3 curriculum chunks grounding the current lesson segment.
- The activity repository (`activities` table) — for the reuse-vs-generate decision.

**Expected usage flow:** ground a planner call in `lesson_state` + `CurriculumMatch[]`, check the repository for a reusable match first, generate new candidates only when nothing fits, verify each candidate, and produce 3 ranked candidates for the teacher shortlist.

Three artifact families ship in v0:

1. **Match/classify** — vocabulary or concept grouping
2. **Sequence/order** — process, story, or argument steps
3. **Guided practice/checkpoint** — short applied questions with hints and feedback

Each artifact is a single self-contained `index.html` bundle plus a manifest:

```json
{
  "contract_version": "activity-artifact/v1",
  "manifest": {
    "family": "match_classify",
    "title": "Vocabulario en contexto: La noticia",
    "difficulty_band": "core",
    "curriculum": { "grade": 7, "subject": "lenguaje", "unit": "U4", "objective": "L7.4.2" },
    "est_minutes": 6,
    "entry": "index.html",
    "sdk_version": "activity-sdk/v1",
    "allowed_capabilities": ["dom", "css", "svg"]
  },
  "bundle_ref": "artifact-bundles/...",
  "verifier_scores": {},
  "evidence": [],
  "status": "verified"
}
```

The verifier checks manifest schema, forbidden APIs, sandbox boot, SDK telemetry assertions, manifest/code consistency, curriculum alignment, answer correctness, hint leakage, and Spanish suitability.

Status: placeholder — manifest schema, verifier, SDK, and sandbox fixtures not yet implemented.
