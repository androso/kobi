# MVP Contract

This contract distills the current [Kobi MVP v0 — Standalone Product Spec](https://app.notion.com/p/2043004d6ca84ba197d85142de83493b) into the repository's implementation constraints. Where the Notion architecture examples predate the running code, the repository's Vite + React, Node worker, Supabase, and shared-contract boundaries remain authoritative.

## Product goal

Validate that Kobi can turn the last 10 minutes of a real class into a personalized, curriculum-grounded activity block, with zero teacher prep — end-to-end, on real audio, with real students, with **zero mocks**. The full loop under test: **Listen → Understand → Propose → Approve → Deliver → Measure**. If any of those six stages is mocked, the MVP hasn't validated anything.

## In scope for MVP

- One class, one grade, and one subject: 7th-grade Lenguaje, focused on reading comprehension and vocabulary.
- Teacher creates a class, picks the pre-ingested textbook unit, gets a join code.
- Teacher starts a live session; mic audio streams; lesson-state (topic, objective, confidence) builds in the background.
- When the teacher taps **Hora de actividad**, Kobi presents a shortlist of 3 verified, curriculum-grounded candidate activities, each with evidence (objective matched, textbook section, reused vs. new, estimated minutes).
- Teacher approval is a hard gate. After approval, students receive support/core/challenge variants according to the teacher-editable banding rules; core is the fallback when a differentiated variant is unavailable.
- Teacher sees a live monitor (who's done, who's stuck) and a session report (completion + correctness) after the session.
- Student signs in with the teacher-provisioned class account, waits, plays the assigned activity, gets a hint after wrong attempts, and sees results.
- Activities are generated-code mini-apps paired with schema-validated manifests and rendered in a sandboxed iframe. Quiz, cloze/vocabulary-in-context, and match/order are prompt exemplars and quality anchors, not a ceiling on interaction patterns.
- Difficulty-banded personalization: 3 variants (support/core/challenge) per approved activity; teacher-selected support/challenge overrides per session, with core as the default for unselected students.
- Repository reuse within Kobi's own content: retrieve and adapt a verified activity before generating a new one, while preserving source and fork lineage.
- Manual fallback at every AI stage: transcription fails → teacher types a topic summary; generation is slow → pull from the pre-seeded activity repository.
- Basic auth: teachers use Supabase Auth and provision username/password student accounts per class.
- Basic telemetry: attempt/hint/complete events, enough to drive the session report.

## Out of scope before MVP validation

- Multi-school or admin portals.
- Generated code with network, browser storage, external APIs, external imports, or any capability outside the verified sandbox contract.
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
- Do not add "nice-to-have" features (pet, deep personalization, unverified generated artifacts, cross-school repositories) unless explicitly promoted from the out-of-scope list above.

## Cut order and fallbacks

If delivery is behind schedule, cut scope in this order:

1. Replace the per-student live monitor with a completed-count summary.
2. Deliver the approved core variant to everyone instead of generating support and challenge variants.
3. Replace live transcription with teacher-entered lesson context.

Never cut the teacher approval gate, sandboxed verified activity delivery, or curriculum grounding with visible evidence. A fallback must still traverse the real application, persist real state, and produce real telemetry; hardcoded or seeded UI state does not satisfy the loop.

## Definition of done

- A teacher creates a class and runs a session from real classroom input without developer help.
- Three curriculum-grounded candidates appear within 60 seconds of **Hora de actividad** and show their matched objective and textbook section.
- The teacher explicitly approves an activity before delivery.
- At least 3 student devices receive playable approved activities, use hints where needed, and complete them through the sandboxed runtime.
- The session report reflects persisted attempt, hint, completion, and correctness telemetry rather than mocks or seed data.
- If transcription or generation fails, the teacher can use the manual-input or verified-repository fallback and still complete the same persisted product loop.

## MVP review rule

Any PR that adds out-of-scope product surface area (see "Out of scope" above), increases implementation complexity without validating the MVP loop, or changes the core user flow without explanation must be flagged as an **MVP drift** issue in review.
