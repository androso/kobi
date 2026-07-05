# Contracts

The team's first agreement — build in parallel against these shared contracts.

## 1. `lesson_state`

Emitted by the lesson-state builder (`apps/worker` / `packages/ai-core`, see `buildLessonState()`) roughly every 2 minutes from the rolling transcript. Raw transcript never travels downstream of this. Implemented as `lessonStateSchema` in `packages/ai-core/src/lessonState.schema.ts`.

```json
{
  "topic": "El sustantivo y sus tipos",
  "objective_guess": "Identificar sustantivos comunes y propios en textos breves",
  "key_terms": ["sustantivo", "común", "propio", "texto"],
  "transcript_summary": "La docente explicó la diferencia entre sustantivos comunes y propios usando ejemplos de personas, lugares y objetos.",
  "confidence": 0.86,
  "evidence": {
    "quoted_phrases": ["los nombres de personas", "sustantivo común", "San Miguel"],
    "reason": "La explicación se centró en clasificación de sustantivos con ejemplos."
  }
}
```

The manual-fallback path (D6) produces the same `lesson_state` shape via `lessonStateFromManualEntry()` — downstream consumers never need a second code path.

## 2. `ActivityArtifact`

Gate 0 decision on 2026-07-04: v0 activities are verified HTML artifacts, not JSON-rendered activities. There are no legacy JSON activities or consumers, so no migration or compatibility adapter is required.

Produced by the planner/generator, checked by the verifier, stored in `activities` (the repository), and delivered through the sandbox host. Schema and SDK contracts are owned by `packages/activities`.

```json
{
  "contract_version": "activity-artifact/v1",
  "manifest": {
    "family": "custom_interactive",
    "title": "Explora la piramide de la noticia",
    "difficulty_band": "core",
    "curriculum": { "grade": 7, "subject": "lenguaje", "unit": "U4", "objective": "L7.4.2" },
    "est_minutes": 6,
    "entry": "index.html",
    "sdk_version": "activity-sdk/v1",
    "allowed_capabilities": ["dom", "css", "svg"],
    "content": {
      "description": "Manipula las partes de una noticia para ver como cambia la claridad del texto.",
      "learning_goal": "Identificar como titular, entradilla, cuerpo y fuente organizan una noticia.",
      "success_criteria": [
        "Reconoce cada parte de la noticia.",
        "Completa una version organizada con evidencia del texto."
      ],
      "telemetry_events": ["attempt", "hint", "complete"]
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
- Allowed families are `match_classify`, `sequence_order`, `guided_practice`, `custom_interactive`, and `exploratory_tool`.
- `content.items[]` is optional for custom/exploratory artifacts; those artifacts must instead provide enough `description`, `learning_goal`, `success_criteria`, and/or `telemetry_events` for teacher review and verifier consistency checks.
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

## 4. `curriculum_match` (Area B -> Area C)

See [`docs/area-bc-contract.md`](area-bc-contract.md) for the full write-up shared with Androso. Returned by `retrieveCurriculumMatches()` in `packages/curriculum`.

Status: `lesson_state` and `curriculum_match` are implemented (see `packages/ai-core`, `packages/curriculum`) — these are the two contracts Isaac (Areas A/B) is responsible for. Gate 0 for `ActivityArtifact` is recorded here. Area C/E/F should freeze the exact TypeScript schemas, fixtures, telemetry shape, and sandbox contract before parallel implementation starts.
