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

## 2. Checkpoint decision (Understand -> Propose gate)

Produced by the checkpoint agent (`apps/worker/src/checkpoint/evaluateCheckpoint.ts`, OpenAI structured output) and consumed by `apps/worker/src/jobs/evaluateCheckpoint.job.ts`. This replaces the old static `confidence >= 0.5` threshold that used to live inline in `buildLessonState.job.ts`. It runs on an independent timer (`checkpointScheduler.job.ts`, default every `CHECKPOINT_INTERVAL_MINUTES` = 10 min), not on every `lesson_state` tick.

Input is the same bounded `SessionContext` (`@kobi/activities`) built from `lesson_state` rows accumulated since the last `ready` checkpoint — never raw transcript.

```json
{
  "ready": true,
  "reason": "Hay un tema claro y vocabulario suficiente para generar una actividad.",
  "summary": "La docente enseñó la estructura de la noticia: titular, entradilla y fuente."
}
```

Every evaluation (pass or fail) is persisted as a row in the `checkpoints` table (`session_id`, `ready`, `reason`, `summary`, `session_context` snapshot, `created_at`) — see `docs/data-model.md`. When `ready` is `false`, the worker does nothing else and waits for the next scheduler tick with more accumulated segments. When `ready` is `true`, the job calls `retrieveCurriculumMatches()` and hands off to Area C's `generate-activity-artifacts` job exactly as before — that job's contract is unchanged.

## 3. `ActivityArtifact`

Produced by the planner/generator, checked by the verifier, stored in `activities` (the repository), and delivered through the sandbox host. Per the revised D2, an activity is one of the three verified HTML artifact families plus a manifest: `activities.bundle_ref` points at the self-contained HTML bundle, and `activities.manifest` (jsonb) is the schema-validated contract for curriculum tags, answer key, hints, `est_minutes`, variants, and family. Gate 0 decision on 2026-07-04: v0 activities are verified HTML artifacts within the three MVP families, not JSON-rendered activities. There are no legacy JSON activities or consumers, so no migration or compatibility adapter is required. Schema and SDK contracts are owned by `packages/activities`.

For the teacher approval flow, Area C writes support/core/challenge rows to `session_activity_candidates`. The teacher may assign selected students to support or challenge; every unselected student receives the approved core candidate by default. Area E records the final per-student delivery in `assignments.variant`.

Assignment rows are only valid for approved candidates from the same session: `assignments.candidate_id`, `activity_id`, and `variant` must match the selected `session_activity_candidates` row, and the assigned student must belong to the session's class.

```json
{
  "contract_version": "activity-artifact/v1",
  "manifest": {
    "family": "guided_practice",
    "title": "Practica: La noticia y sus partes",
    "difficulty_band": "core",
    "curriculum": { "grade": 7, "subject": "lenguaje", "unit": "U4", "objective": "L7.4.2" },
    "est_minutes": 6,
    "entry": "index.html",
    "sdk_version": "activity-sdk/v1",
    "allowed_capabilities": ["dom", "css"],
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
- Allowed families are `match_classify`, `sequence_order`, and `guided_practice`.
- `content.items[]` is required and must include prompts plus answer keys; hints default to an empty list when omitted.
- `bundle_ref` must be unguessable and authorized by assignment/class before iframe delivery.
- Auth-lite students receive a per-student `access_token` from `join_class_by_code`; student assignment reads, dismissals, telemetry, and completion go through checked delivery RPCs using that token, not broad anonymous table access.
- Rejoining with the same class code and display name reuses the existing student identity and rotates its `access_token`; this recovers a lost or legacy browser session without creating a duplicate student row.
- The parent injects only manifest, assignment id, and difficulty band. It must not inject Supabase credentials, student PII, raw transcript, or broader class/session context.
- The iframe communicates only through the Activity SDK over `postMessage`: `getManifest()`, `getBand()`, `reportAttempt()`, `reportHint()`, and `reportComplete()`.
- The parent validates message source, schema, assignment authorization, method allowlist, payload size, and telemetry rate limits.
- Teacher edits are manifest-only and must pass schema validation, escaped rendering, forbidden field checks, and manifest/code consistency smoke validation.

## 4. Telemetry event

Written to the `events` table on every student interaction; read back for the live monitor and session report.

```json
{
  "type": "attempt",
  "payload": { "assignment_id": "...", "item_index": 0, "correct": true },
  "ts": "2026-07-04T20:00:00Z"
}
```

## 5. `curriculum_match` (Area B -> Area C)

See [`docs/area-bc-contract.md`](area-bc-contract.md) for the full write-up shared with Androso. Returned by `retrieveCurriculumMatches()` in `packages/curriculum`.

Status: `lesson_state` and `curriculum_match` are implemented (see `packages/ai-core`, `packages/curriculum`) — these are the two contracts Isaac (Areas A/B) is responsible for. Gate 0 for `ActivityArtifact` is recorded here. Area C/E/F should freeze the exact TypeScript schemas, fixtures, telemetry shape, and sandbox contract before parallel implementation starts.
