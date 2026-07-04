# Kobi MVP v0 — Standalone Product Spec (condensed)

Full source of truth: Notion — "Kobi MVP v0 — Standalone Product Spec" (under Kobi — ai school assistant / hackathon #1).

## MVP Thesis

Kobi v0 turns the last 10 minutes of any class into a personalized, curriculum-grounded activity block — with zero teacher prep. The complete loop: **Listen → Understand → Propose → Approve → Deliver → Measure.** If any of those six stages is mocked, it's not a product.

## In / out of scope (v0)

**In:** one class/grade/subject, 3 activity template families, difficulty-banded personalization (3 variants), plain student experience (activity + hints + results), repository reuse within own content, teacher approval as a hard gate, session report (completion + correctness).

**Out:** multi-school/admin portals, arbitrary generative game mechanics, deep learner modeling, pet companion, cross-school repositories, auto-delivery without review, longitudinal analytics.

## Decision Log

| # | Decision | Rationale |
|---|---|---|
| D1 | Subject: 7th-grade Lenguaje (reading comprehension + vocabulary) | Team owns the Ministry textbooks; avoids math's complex interaction mechanics |
| D2 | Activity artifacts are verified HTML mini-apps plus manifests | Gate 0 decision on 2026-07-04: v0 uses self-contained HTML/CSS/JS artifacts in a sandboxed iframe, described by a structured manifest and verified before teacher display. This replaces the earlier JSON-player direction. |
| D3 | TypeScript stack: Vite + React frontend, Node API/worker backend | 3 devs, 24 hours, TS-native team. Supabase (Postgres, pgvector, Realtime) gives the same layering as a Python split without adding another language |
| D4 | Personalization v0 = difficulty banding, not learner modeling | 3 variants (support/core/challenge); don't ship personalization you can't measure |
| D5 | No pet in v0 | Cut for scope; hints stay in the activity artifact manifest/runtime, not the pet; pet is a post-MVP retention layer |
| D6 | Manual fallback at every AI stage | Transcription fails → teacher types 2-line topic summary; generation slow → pull from pre-seeded repository |
| D7 | UI in Spanish, code/docs in English | Salvadoran classroom product |
| D8 | Reaffirmed D3 during repo setup: no Python/FastAPI/uv | LangSmith, OpenAI, and Anthropic all ship first-class TS SDKs covering telemetry/eval needs — a second language/package-manager/deploy-target isn't worth it for a 3-dev, 24-hour build |
| D9 | No legacy JSON activity migration | There are no production JSON activities or consumers yet, so v0 has no legacy compatibility path. Implement the HTML artifact contract directly. |

## System Architecture

3 deployables:
- **Web app (Vite + React)** — teacher portal and student portal. Supabase Realtime pushes assignments and progress.
- **Backend/worker (Node on Railway/Fly)** — API endpoints, transcription, lesson-state builder, pre-generation, verifier. Queue: pg-boss on Postgres.
- **Supabase (Postgres + pgvector + Realtime + Auth)** — all state including embeddings.

```mermaid
flowchart TD
    MIC[Teacher mic - audio chunks] --> TR[Transcription]
    TR --> LS[Lesson-state builder]
    LS --> PRE[Pre-generation pipeline]
    CUR[(Curriculum chunks)] --> PRE
    REPO[(Activity repository)] --> PRE
    PRE --> VER[Verifier]
    VER --> SHORT[Teacher shortlist UI]
    SHORT -->|approve| VAR[Variant maker]
    VAR --> DEL[Student delivery - realtime]
    DEL --> TEL[(Telemetry)]
    TEL --> REP[Session report]
    TEL --> PROF[(Student profiles)]
    PROF --> VAR
```

## Ownership Areas

| Area | Mission | Contract (in → out) |
|---|---|---|
| A. Listening & Understanding | Turn live classroom audio into a machine-readable picture of what's being taught | mic audio → rolling `lesson_state` |
| B. Curriculum & Retrieval | Make the textbook searchable and match it to the live lesson | textbook unit + `lesson_state` → matching objectives/chunks |
| C. Activity Generation & Quality | Produce classroom-ready, verified activity artifacts grounded in curriculum | `lesson_state` + curriculum chunks + repository → 3 verified candidate `ActivityArtifact`s |
| D. Teacher Experience | Zero-prep control: start session, see understanding, approve with evidence, monitor, review | candidate activities + telemetry → approval decision + session report |
| E. Student Experience & Activity Engine | Deliver activities as a clean, fast student experience, capture telemetry | approved activity + student band → rendered play + telemetry |
| F. Platform & Data Backbone | Shared substrate: identity, storage, realtime delivery, background jobs | every other area reads/writes through it |

Put one name on each area (one person can own two small ones). Agree the shared contracts (`lesson_state`, `ActivityArtifact`, telemetry event — see `docs/contracts.md`) first, then build in parallel.

## Cut Lines (if behind schedule, cut in this order)

1. Live monitor → simple completed-count
2. Variant maker → single *core* variant for everyone
3. Live transcription → teacher manual topic entry (this is a feature, per D6, not just a fallback)

**Never cut:** teacher approval gate, verified artifact delivery, curriculum grounding with visible evidence.

## Definition of Done (no-mock test)

- A teacher creates a class and runs a session on real audio with no developer help
- 3 curriculum-grounded options appear ≤ 60s after "Hora de actividad"
- Each option shows evidence: objective + textbook section + reused/new
- 3+ student devices receive banded variants and complete them
- The session report reflects real telemetry, not seeds
- Kill the wifi mid-session → manual fallback still completes the loop

## Activity Artifact Decision

HTML activity artifacts are v0, not post-MVP. Each candidate activity is a single self-contained `index.html` bundle plus a structured manifest. The bundle runs only inside the sandboxed student iframe, uses no external imports/assets/network, and reports attempts, hints, and completion through the parent-owned SDK over `postMessage`.

The three v0 families are:

1. **Match/classify** — vocabulary or concept grouping.
2. **Sequence/order** — process, story, or argument steps.
3. **Guided practice/checkpoint** — short applied questions with hints and feedback.

Seeded runnable artifacts use the same contract and verifier path as generated artifacts. If generation or verification fails, the D6 fallback is a pre-seeded verified artifact, not a manifest-only renderer.
