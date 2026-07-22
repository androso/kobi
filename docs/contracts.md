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

Produced by repository reuse, the deterministic static fallback, or the model-backed planner/generator; checked by the verifier; stored in `activities` (the repository); and delivered through the sandbox host. Per revised D2, every v0 artifact is a verified self-contained HTML/CSS/JavaScript `index.html` bundle plus a manifest. React components, TSX, multi-file bundles, and JSON-rendered activities are unsupported. `activities.bundle_ref` locates the HTML bundle, while `activities.manifest` (jsonb) is the runtime-owned, schema-validated contract for curriculum tags, editable content, answer keys, hints, `est_minutes`, variants, family, and mechanic. Schema and SDK contracts are owned by `packages/activities`.

For the teacher approval flow, Area C writes support/core/challenge rows to `session_activity_candidates`. The teacher may assign selected students to support or challenge; every unselected student receives the approved core candidate by default. Area E records the final per-student delivery in `assignments.variant`.

Repository reuse prefers complete strong sets sharing one `activity_set_id`. Pre-set-id verified rows remain eligible only when a complete support/core/challenge trio clears the strong-reuse threshold and shares the exact grade, subject, unit, objective, family, and mechanic signature; unrelated legacy interactions are never combined into a fallback set.

Assignment rows are only valid for approved candidates from the same session: `assignments.candidate_id`, `activity_id`, and `variant` must match the selected `session_activity_candidates` row, and the assigned student must belong to the session's class.

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
  "activity_set_id": "set-...",
  "status": "verified"
}
```

### Artifact bundle rules

- Bundle format is one self-contained `index.html` with inline HTML/CSS/JavaScript. React/TSX components and multi-file bundles are not artifact formats. URL-bearing subresource attributes must not point to relative paths or external schemes, while `data:` URLs remain available for inline assets such as images.
- No external imports, assets, network calls, credentialed requests, storage APIs, top navigation, popups, or same-origin assumptions.
- `family` is the three-value taxonomy `match_classify`, `sequence_order`, or `guided_practice`. Those values are prompt, ranking, reuse, and quality exemplars, not renderer selectors or an interaction whitelist.
- `mechanic` is required for every new artifact and is a validated free-form snake_case slug (1–64 characters), not an enum or renderer selector. The sandbox, SDK, and verifier bound interaction mechanics. Every generated/adapted three-band set must share one family and mechanic; `learning_design` and `visual_theme` metadata are preserved across model normalization.
- `content.items[]` is required and includes prompts, answer keys, and hints (defaulting to an empty list). This manifest is the runtime-owned editable source: bundle JavaScript must call `getManifest()` and `getBand()`, then render, score, and reveal hints from the returned values. Bundle source must not duplicate editable prompt, answer, or hint values.
- Repository-reused, deterministic static-fallback, adapted, and model-generated artifacts all use this same runnable contract. Static fallback artifacts must remain interactive; there is no manifest-only renderer fallback.
- `bundle_ref` must be unguessable and authorized by assignment/class before iframe delivery.
- Bundle references are generated from cryptographically random UUIDs; they are opaque locators, not bearer credentials, and possession never bypasses assignment/class authorization.
- Students authenticate with teacher-managed username/password accounts. Delivery derives the student mapping from `auth.uid()`; assignment reads, dismissals, telemetry, and completion are restricted to that mapping by RLS. `join_class_by_code` and browser-held student bearer tokens are not part of the active contract.
- Authenticated teachers can read candidates, artifacts, bundles, assignments, and telemetry only through sessions in classes they own. They may approve candidates and publish assignments, while candidate/artifact/bundle creation and telemetry insertion remain worker/service-role or student-owned operations.
- The parent injects only manifest, assignment id, and difficulty band. It must not inject Supabase credentials, student PII, raw transcript, or broader class/session context.
- The iframe communicates only through the Activity SDK over `postMessage`: `getManifest()`, `getBand()`, `reportAttempt()`, `reportHint()`, and `reportComplete()`.
- The parent validates message source, schema, assignment authorization, method allowlist, payload size, and telemetry rate limits.
- The host injects a restrictive CSP and renders both teacher previews and student delivery with `sandbox="allow-scripts"` and `referrerPolicy="no-referrer"`; the artifact receives no same-origin, form, navigation, popup, frame, or network capability.
- Before persistence, the verifier must run the secured HTML in a browser, answer SDK manifest/band requests with the candidate values, fail on page errors, and observe valid SDK request/telemetry traffic. Static source checks must also reject embedded editable manifest values and otherwise enforce manifest/code consistency.
- Teacher edits are manifest-only and must pass the same schema, escaped-rendering, forbidden-field, manifest/code-consistency, and browser-smoke gates before the edited artifact is persisted.

Structural and JavaScript source checks are generation-time defense-in-depth, not the runtime security boundary. Runtime isolation comes from the host sandbox/CSP plus assignment-scoped delivery authorization; required browser smoke verifies behavior under that boundary before persistence.

## 4. Telemetry event

Written to the `events` table on every student interaction; read back for the live monitor and session report.
Completion events declare `score_unit` as either `count` or `normalized`, while `assignments.score` stores the normalized 0–1 outcome used for repository ranking. Count scores require integer `score` and `total` values and cannot exceed `total`; normalized scores require a 0–1 `score` and omit `total`. Existing `activity-sdk/v1` bundles without `score_unit` retain the legacy convention where the presence of `total` means count, but every newly verified bundle must declare the unit. Once an assignment reaches `completed`, its status, score, and completion timestamp are immutable so repository outcome aggregation runs exactly once; later roster republishes preserve that completed row rather than resetting or rejecting it. Generated activity UIs must disable completion after their first valid submission so duplicate clicks do not attempt a second immutable update.

```json
{
  "type": "attempt",
  "payload": { "assignment_id": "...", "item_index": 0, "correct": true },
  "ts": "2026-07-04T20:00:00Z"
}
```

Session reports are database-derived through `list_teacher_session_reports`: the RPC checks teacher/class ownership and combines sessions, lesson-state segments, assignments, and events into bounded, paginated results. Assignments are the canonical completion/score record, so late corrections replace the stored outcome; event rows supply hints and difficult-item counts. Each difficult-item entry is scoped by `candidate_id`, `activity_id`, `variant`, and `item_index`, so support/core/challenge prompts never collapse into one count. Realtime report refreshes observe `segments` and `events` through teacher-owned SELECT policies, so changed rows are delivered only for the authenticated teacher's classes. Activity `times_used` and `avg_score` are recomputed idempotently from current, non-dismissed assignments.

## 5. `curriculum_match` (Area B -> Area C)

See [`docs/area-bc-contract.md`](area-bc-contract.md) for the full write-up shared with Androso. Returned by `retrieveCurriculumMatches()` in `packages/curriculum`.

`CurriculumMatch.source_id` identifies shared teacher-fed evidence. Automatic retrieval uses the ready source IDs selected for the session's class; an empty selection uses compatible curated defaults. Activity evidence remains a generation-time snapshot if selections later change.

Status: `lesson_state` and `curriculum_match` are **shipped** (see `packages/ai-core`, `packages/curriculum`). `ActivityArtifact`, telemetry, and sandbox contracts are **shipped** in `packages/activities` and consumed by `apps/web` and `apps/worker`; Gate 0 for the artifact contract is recorded here.
