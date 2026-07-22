# packages/activities

Area C: Activity Generation & Quality (owned by Androso) — artifact manifest schema, verifier, sandbox SDK, and rubric side shared by `apps/web` and `apps/worker`.

**Contract:** `lesson_state` + curriculum chunks + repository -> 3 verified candidate `ActivityArtifact`s.

Gate 0 decision on 2026-07-04: v0 uses only self-contained HTML/CSS/JavaScript `index.html` mini-app artifacts plus structured manifests. React/TSX components, multi-file bundles, and JSON-rendered activities are unsupported artifact formats.

**What this package receives (Isaac's side of the contract — see `docs/area-bc-contract.md`):**

- `lesson_state` (from `@kobi/ai-core`) — topic, objective guess, key terms, confidence, evidence.
- `CurriculumMatch[]` (from `@kobi/curriculum`'s `retrieveCurriculumMatches()`) — top-3 curriculum chunks grounding the current lesson segment.
- The activity repository (`activities` table) — for the reuse-vs-generate decision.

**Expected usage flow:** build bounded context from `lesson_state` + `CurriculumMatch[]`, check the repository for a complete reusable set first, then adapt or generate a coherent `GamePlan` set only when needed. The interactive deterministic static fallback uses the same contract and is not model-generated. Verify each candidate before persistence and produce 3 ranked candidates for the teacher shortlist. The teacher can assign selected students to support/challenge; unselected students receive core by default.

The manifest keeps one of three family taxonomy values—`match_classify`, `sequence_order`, or `guided_practice`—as a prompt, ranking, reuse, and quality exemplar. Families are not renderer selectors or an interaction whitelist. Each new artifact also has a required validated free-form snake_case `mechanic` slug (1–64 characters); all three bands in a generated/adapted set share one family and mechanic. Mechanics may vary freely within the sandbox, SDK, and verifier contract.

Each artifact is a single self-contained HTML/CSS/JavaScript `index.html` bundle plus a manifest:

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

The manifest is the runtime-owned editable content source. Bundle code must request it and the difficulty band through `getManifest()` / `getBand()`, then render prompts, score answers, and reveal hints from the returned values; editable prompts, answer keys, and hints must not be embedded in bundle source.

Implemented exports:

- manifest, artifact, evidence, verifier-score, source, and SDK `postMessage` validators
- `buildActivitySessionContext()` for bounded context from structured `lesson_state` rows only
- `createActivityArtifactCandidates()` for interactive deterministic support/core/challenge HTML fallback artifacts
- `verifyActivityArtifact()` for manifest schema, structural HTML, forbidden APIs, SDK hooks, embedded-content rejection, manifest/code consistency, and required secured-browser smoke before persistence
- `createUnguessableBundleRef()` for cryptographically random, opaque bundle locators
- `authorizeActivityTelemetryMessage()` for parent-owned assignment telemetry validation
- repository ranking helpers that bias objective match, current lesson context, verifier score, usage, outcomes, and set-level coherence

The verifier performs structural and deterministic checks plus required browser smoke and local rubric scoring; the worker's OpenAI path adds a structured AI review before persistence. Browser smoke loads the secured HTML with the supplied manifest/band, fails on page errors, and requires valid SDK traffic. These are pre-persistence defenses; the web host still enforces the shared iframe sandbox/CSP policy, and bundle delivery still requires assignment/class authorization.
