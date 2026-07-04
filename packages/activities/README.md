# packages/activities

Area C: Activity Generation & Quality (schema/validator/player/rubric side — shared by `apps/web` and `apps/worker`).

**Contract:** `lesson_state` + curriculum chunks + repository → 3 verified candidate activities (JSON).

Three template families ship in v0, one generic renderer covers all three, every item is mechanically verifiable:

1. **Quiz** — multiple choice, single/multi answer
2. **Cloze / vocabulary-in-context** — fill the blank from options
3. **Match & order** — pair terms ↔ definitions, sequence events

Example (`vocab_cloze`):

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

Because activities are schema-validated JSON, the verifier can check every item mechanically: answer key exists, exactly one correct option, hints don't leak answers, reading load fits the band.

Status: placeholder — schema, validator, and generic player not yet implemented.
