# Contracts

The team's first agreement — build in parallel against these three JSON shapes.

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

The manual-fallback path (D6) produces this exact same shape via `lessonStateFromManualEntry()` — downstream consumers never need a second code path.

## 2. Activity

Produced by the planner/generator, checked by the verifier, stored in `activities` (the repository). **Owned by Androso (Area C)** — the shape, schema, and validator are his design call, not prescribed here. The example below is the reference shape from the original product spec, kept as a starting point only.

```json
{
  "type": "vocab_cloze",
  "title": "Vocabulario en contexto: La noticia",
  "curriculum": { "grade": 7, "subject": "lenguaje", "unit": "U4", "objective": "L7.4.2" },
  "est_minutes": 6,
  "variants": ["support", "core", "challenge"],
  "items": [
    {
      "prompt": "El periodista redactó la ___ antes del mediodía.",
      "options": ["noticia", "novela", "receta"],
      "answer": 0,
      "hint": "Es un texto informativo sobre un hecho reciente."
    }
  ]
}
```

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

Status: `lesson_state` and `curriculum_match` are implemented (see `packages/ai-core`, `packages/curriculum`) — these are the two contracts Isaac (Areas A/B) is responsible for. Activity and telemetry-event shapes are Androso/Area D-E's to define and freeze.
