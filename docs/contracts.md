# Contracts

The team's first agreement — build in parallel against these three JSON shapes.

## 1. `lesson_state`

Emitted by the lesson-state builder (`apps/worker` / `packages/ai-core`) roughly every 2 minutes from the rolling transcript. Raw transcript never travels downstream of this.

```json
{
  "topic": "el sustantivo",
  "objective": "U3.2",
  "confidence": 0.86
}
```

## 2. Activity

Produced by the planner/generator, checked by the verifier, stored in `activities` (the repository). Schema owned by `packages/activities`.

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

Status: shapes above are drafts from the product spec — refine and freeze before parallel build starts.
