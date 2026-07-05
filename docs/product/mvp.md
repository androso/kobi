# MVP Contract

## Product goal

Validate that Kobi can turn the last 10 minutes of a real class into a personalized, curriculum-grounded activity block, with zero teacher prep — end-to-end, on real audio, with real students, with **zero mocks**. The full loop under test: **Listen → Understand → Propose → Approve → Deliver → Measure**. If any of those six stages is mocked, the MVP hasn't validated anything.

## In scope for MVP

- Teacher creates a class, picks the pre-ingested textbook unit, gets a join code.
- Teacher starts a live session; mic audio streams; lesson-state (topic, objective, confidence) builds in the background.
- Teacher sees support/core/challenge curriculum-grounded artifacts, each with evidence (objective matched, textbook section, reused vs. new, estimated minutes).
- Teacher approves each band before it reaches students (hard gate); if support/challenge is not approved, that band receives the approved core artifact.
- Teacher sees a live monitor (who's done, who's stuck) and a session report (completion + correctness) after the session.
- Student joins via code + display name, waits, plays the assigned activity, gets a hint after wrong attempts, sees results.
- 3 exercise artifact families plus bounded custom/exploratory HTML artifacts — verified HTML bundles plus structured manifests, rendered in the sandboxed artifact iframe.
- Difficulty-banded personalization: support/core/challenge artifacts, approved per band.
- Manual fallback at every AI stage: transcription fails → teacher types a topic summary; generation is slow → pull from the pre-seeded activity repository.
- Basic auth: teachers via magic link, students via join code + display name.
- Basic telemetry: attempt/hint/complete events, enough to drive the session report.

## Out of scope before MVP validation

- Multi-school or admin portals.
- Unbounded generative game mechanics outside the verified artifact contract.
- Deep learner modeling or mastery estimation.
- Pet companion (hatching, personality, celebrations).
- Cross-school shared repositories.
- Auto-delivery of activities without teacher review.
- Longitudinal analytics or next-day recall tracking.
- A Python/FastAPI/uv backend or any second language/runtime alongside the TypeScript stack.

## Non-negotiables

- Do not introduce features that require significant new domain models (new core tables beyond the 8 already defined in `packages/db`) unless they directly support the six-stage MVP loop.
- Do not add infrastructure complexity — new deploy targets, new languages, new package managers — beyond Vite + React (`apps/web`), Node/Railway-Fly (`apps/worker`), and Supabase. This includes not adding a Python/FastAPI service.
- Do not change the core teacher/student flow (Listen → Understand → Propose → Approve → Deliver → Measure) without explaining why in the PR description.
- Never remove or weaken the teacher approval gate, verified artifact delivery, or curriculum grounding with visible evidence — these three *are* the product.
- Do not ship unverified free-form generated code. Every HTML artifact must pass manifest schema checks, sandbox/static checks, SDK telemetry assertions, manifest/code consistency checks, and rubric validation before teacher display.
- Do not add "nice-to-have" features (pet, deep personalization, unverified activity families, cross-school repositories) unless explicitly promoted from the out-of-scope list above.

## MVP review rule

Any PR that adds out-of-scope product surface area (see "Out of scope" above), increases implementation complexity without validating the MVP loop, or changes the core user flow without explanation must be flagged as an **MVP drift** issue in review.
