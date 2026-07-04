# Contracts

The team's first agreement — build in parallel against these shared contracts.

## 1. `lesson_state`

Emitted by the lesson-state builder (`apps/worker` / `packages/ai-core`) roughly every 2 minutes from the rolling transcript. Raw transcript never travels downstream of this.

```json
{
  "topic": "el sustantivo",
  "objective": "U3.2",
  "confidence": 0.86
}
```

## 2. `ActivityArtifact`

Gate 0 decision on 2026-07-04: v0 activities are verified HTML artifacts, not JSON-rendered activities. There are no legacy JSON activities or consumers, so no migration or compatibility adapter is required.

Produced by the planner/generator, checked by the verifier, stored in `activities` (the repository), and delivered through the sandbox host. Schema and SDK contracts are owned by `packages/activities`.

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
    "allowed_capabilities": ["dom", "css", "svg"],
    "content": {
      "items": [
        {
          "prompt": "Clasifica cada palabra según su función en una noticia.",
          "answer_key": ["titular", "entradilla", "fuente"],
          "hints": ["Busca palabras que presentan el hecho principal."]
        }
      ]
    }
  },
  "bundle_ref": "artifact-bundles/...",
  "verifier_scores": {
    "deterministic": "pass",
    "rubric": {
      "curriculum_alignment": 0.9,
      "age_fit": 0.9,
      "spanish_suitability": 0.95
    }
  },
  "evidence": [
    {
      "objective_code": "L7.4.2",
      "section": "Unidad 4 / La noticia",
      "text": "Verbatim Area B evidence string"
    }
  ],
  "parent_id": null,
  "status": "verified"
}
```

### Artifact bundle rules

- Bundle format is one self-contained `index.html` with inline CSS/JS.
- No external imports, assets, network calls, credentialed requests, storage APIs, top navigation, popups, or same-origin assumptions.
- `bundle_ref` must be unguessable and authorized by assignment/class before iframe delivery.
- The parent injects only manifest, assignment id, and difficulty band. It must not inject Supabase credentials, student PII, raw transcript, or broader class/session context.
- The iframe communicates only through the Activity SDK over `postMessage`: `getManifest()`, `getBand()`, `reportAttempt()`, `reportHint()`, and `reportComplete()`.
- The parent validates message source, schema, assignment/student authorization, method allowlist, payload size, and telemetry rate limits.
- Teacher edits are manifest-only and must pass schema validation, escaped rendering, forbidden field checks, and manifest/code consistency smoke validation.

## 3. Telemetry event

Written to the `events` table on every student interaction; read back for the live monitor and session report.

```json
{
  "type": "attempt",
  "payload": { "assignment_id": "...", "item_index": 0, "correct": true },
  "ts": "2026-07-04T20:00:00Z"
}
```

Status: Gate 0 is recorded here. Implementation should freeze the exact TypeScript schemas and fixtures from these contracts before parallel build starts.
