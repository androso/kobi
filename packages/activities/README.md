# packages/activities

Area C: Activity Generation & Quality (owned by Androso) — artifact manifest schema, verifier, sandbox SDK, and rubric side shared by `apps/web` and `apps/worker`.

**Contract:** `lesson_state` + curriculum chunks + repository -> 3 verified candidate `ActivityArtifact`s.

Gate 0 decision on 2026-07-04: v0 uses self-contained HTML/CSS/JS mini-app artifacts plus structured manifests. There are no legacy JSON activities or consumers, so no JSON migration path is needed.

**What this package receives (Isaac's side of the contract — see `docs/area-bc-contract.md`):**

- `lesson_state` (from `@kobi/ai-core`) — topic, objective guess, key terms, confidence, evidence.
- `CurriculumMatch[]` (from `@kobi/curriculum`'s `retrieveCurriculumMatches()`) — top-3 curriculum chunks grounding the current lesson segment.
- The activity repository (`activities` table) — for the reuse-vs-generate decision.

**Expected usage flow:** ground a planner call in `lesson_state` + `CurriculumMatch[]`, create a shared `GamePlan`, check the repository for a complete reusable set first, adapt medium matches with parent lineage, and generate new candidates only when nothing fits, verify each candidate, and produce 3 ranked candidates for the teacher shortlist. The teacher can assign selected students to support/challenge; unselected students receive core by default.

Three artifact families ship in v0:

1. **Match/classify** — vocabulary or concept grouping
2. **Sequence/order** — process, story, or argument steps
3. **Guided practice/checkpoint** — short applied questions with hints and feedback

Each artifact is a single self-contained `index.html` bundle plus a manifest:

```json
{
  "contract_version": "activity-artifact/v1",
  "manifest": {
    "family": "guided_practice",
    "mechanic": "source_check_desk",
    "title": "Practica: La noticia y sus partes",
    "difficulty_band": "core",
    "curriculum": { "grade": 7, "subject": "lenguaje", "unit": "U4", "objective": "L7.4.2" },
    "est_minutes": 6,
    "entry": "index.html",
    "sdk_version": "activity-sdk/v1",
    "allowed_capabilities": ["dom", "css"],
    "learning_design": {
      "learning_goal": "Practicar la estructura de la noticia.",
      "interaction_summary": "Mesa de verificacion de fuentes con feedback inmediato.",
      "success_criteria": ["Completa la interaccion", "Usa evidencia del objetivo"]
    },
    "visual_theme": { "scene": "mesa de verificacion", "accent": "azul Kobi" },
    "content": {
      "items": [
        {
          "prompt": "Responde usando el objetivo L7.4.2: identificar titular, entradilla y fuente.",
          "answer_key": ["titular", "entradilla", "fuente"],
          "hints": ["Vuelve al vocabulario clave antes de responder."]
        }
      ],
      "telemetry_events": ["attempt", "hint", "complete"]
    }
  },
  "bundle_ref": "artifact-bundles/.../index.html",
  "verifier_scores": {},
  "evidence": [],
  "activity_set_id": "set-...",
  "status": "verified"
}
```

Implemented exports:

- manifest, artifact, evidence, verifier-score, source, and SDK `postMessage` validators
- `buildActivitySessionContext()` for bounded context from structured `lesson_state` rows only
- `createActivityArtifactCandidates()` for deterministic support/core/challenge HTML fallback artifacts
- `verifyActivityArtifact()` for schema, static bundle, SDK hook, and manifest/code consistency checks
- `authorizeActivityTelemetryMessage()` for parent-owned assignment telemetry validation
- repository ranking helpers that bias objective match, current lesson context, verifier score, usage, outcomes, and set-level coherence

The package verifier performs deterministic checks plus local rubric scoring. The worker's OpenAI generation path adds a separate structured AI review gate before generated candidates can be persisted; browser sandbox boot remains Area E-owned.
