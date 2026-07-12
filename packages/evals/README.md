# packages/evals

Eval harness/runner code. Do not ship personalization or prompt changes without evals covering these families:

| Eval family | What it checks |
|---|---|
| Taught-material extraction | Did the system correctly infer what was actually taught in the lesson segment? |
| Curriculum alignment | Did it map to the right standard/objective, not an adjacent one? |
| Retrieval quality | Did it find the best reusable activity or miss it? |
| Activity validity | Is the activity accurate, age-appropriate, solvable, and time-fit? |
| Personalization quality | Does the adaptation match the student's stored pedagogical needs? |
| Safety/fairness | Does output quality degrade by subgroup or language background? |

Tracing/telemetry: use the `langsmith` TS SDK (or equivalent) — no Python/FastAPI needed for this.

Status: planned — this file defines the required families, but no eval harness or runner is implemented yet.
