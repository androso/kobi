# Area C Plan: RAG-Grounded Generated Activity Artifacts

## Summary

- Standardize MVP artifacts as single-file HTML mini-apps plus a structured manifest. This is best for the agent and for game-like activities because it supports DOM/canvas/SVG interactions without React builds, imports, or bundling failure modes.
- Area C consumes only structured `lesson_state` / whole-session context plus Area B's top-3 `CurriculumMatch[]` results. It must never consume raw transcript.
- The teacher receives three level-specific artifacts: support, core, and challenge. Each is approved individually; if support/challenge is not approved, students in that band receive the approved core activity.
- No manifest-only renderer fallback. Delivery uses verified runnable artifacts only, with pre-seeded artifacts as the D6 fallback.

## Key Interfaces

- Update contracts/docs from the stale JSON-player model to: `ActivityArtifact = manifest + bundle_ref + verifier_scores + evidence`.
- Manifest includes: family, title, difficulty_band, curriculum, est_minutes, content.items, answer key, hints, entry: `index.html`, sdk_version, and allowed_capabilities.
- Bundle format: one self-contained `index.html` with inline CSS/JS, no external imports/assets/network. Game-like activities may use DOM, CSS animations, SVG, or canvas.
- Activity SDK lives in `packages/activities` and is exposed to the iframe via `postMessage`: `getManifest()`, `getBand()`, `reportAttempt()`, `reportHint()`, `reportComplete()`.
- Area B contract: `retrieveCurriculumMatches(supabase, { queryText, grade, subject, unit })` returns top-3 `CurriculumMatch[]` results from `@kobi/curriculum`: `objective_code`, `unit`, `grade`, `subject`, `text`, and `similarity`. Area C should use those structured fields directly for grounding and derive teacher-visible artifact evidence from them.
- Area C pre-generation job boundary, transported by `pg-boss` from the worker once a confident lesson state and retrieval result are ready:

```ts
interface GenerateActivityArtifactsJobData {
  sessionId: string;
  lessonState: LessonState; // import from @kobi/ai-core
  curriculumMatches: CurriculumMatch[]; // import from @kobi/curriculum
}
```

Area C owns the job handler and generation pipeline behind this payload; the worker/Area B branch owns when and how the job is enqueued.

## Implementation Flow

- Build a worker-side `session_context` from all `segments.lesson_state` rows in the session: latest topic/objective, accumulated vocabulary, examples used, misconceptions, time remaining, and confidence. Bound it for prompts; do not include transcript text.
- On each confident lesson-state update or objective/topic change, consume the Area C pre-generation job with `sessionId`, `LessonState`, and `CurriculumMatch[]`. Keep the latest verified support/core/challenge artifacts warm for the session; mark older candidates superseded when context changes materially.
- Retrieval-first generation:
  - Query activity repository using session context plus matched curriculum objective.
  - Reuse strong matches, fork/adapt near matches, generate new only when retrieval is weak.
  - Store adapted/new passing artifacts back into the shared repository with `parent_id` for forks.
- Teacher flow:
  - "Hora de actividad" returns the latest verified support/core/challenge artifacts within 60s.
  - Teacher may edit manifest content only, not code. Edits trigger manifest/schema validation plus a fast smoke check.
  - Approval is per band. Assignment creation resolves `student_profiles.band`; missing support/challenge approval falls back to core.
- Verifier is two-stage:
  - Deterministic: manifest schema, forbidden API/static checks, sandbox boot, SDK telemetry assertions, and manifest/code consistency smoke test.
  - Rubric model: curriculum alignment, age fit, duration, answer correctness, hint leakage, duplicate risk, and Spanish suitability.
- Sandbox host is owned by Area E:
  - iframe with strict sandbox/CSP, no Supabase credentials inside generated code.
  - parent page injects manifest/assignment/band and writes SDK telemetry to events.
  - crashes or missing telemetry reject the artifact before teacher display.
- Repository ranking should bias toward objective match, embedding similarity over manifest plus code summary, verifier score, times_used, and avg_score.

## Test Plan

- Contract tests for manifest validation and SDK message shapes.
- Worker tests proving RAG queries are built from `session_context`, not transcript, and `CurriculumMatch[]` fields are mapped into artifact evidence without inventing unavailable Area B fields.
- Retrieval tests for reuse, fork/adapt, generate-new, and stale-candidate invalidation.
- Sandbox tests loading seeded and generated HTML, blocking network/storage, verifying boot plus attempt/hint/complete events.
- End-to-end smoke: seeded artifact -> teacher approval -> assignment by band -> student iframe plays -> telemetry row written.
- Demo acceptance: three verified artifacts ready within 60s, at least one reused and one new/forked, and pre-seeded code artifacts survive generation failure.

## Assumptions

- The Jul 4 generated-code artifact research supersedes local stale repo docs.
- MVP uses TypeScript only, Supabase/Postgres/pgvector/Realtime, pg-boss worker jobs, and Spanish UI/activity text.
- Single-file HTML is the MVP artifact format; React or multi-file bundles are post-MVP.
- No manifest-only fallback is implemented.
- Core is the delivery fallback for unapproved support/challenge bands.
