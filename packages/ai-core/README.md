# packages/ai-core

Model routing for every AI stage. Cheap online path, expensive offline path — see `docs/product-spec.md` section 5.

| Stage | Model class | Mode | Notes |
|---|---|---|---|
| Transcription | OpenAI `gpt-4o-mini-transcribe`, 45-60s chunks | rolling async | chunked > streaming: cheaper, resilient |
| Lesson-state builder | small model, structured output | every ~2 min | emits `lesson_state` JSON; raw transcript never travels downstream |
| Retrieval | pgvector top-3 + metadata filters | sync | curriculum chunks are atomic, objective-level, ~150-300 tokens |
| Planner + generator | frontier model | background (pre-creation) | retrieval-first: adapt existing before authoring support/core/challenge artifacts |
| Verifier | mid model, rubric → JSON scores | background | checks alignment, age-fit, duration, answer-key correctness, duplicates |

Cost guardrail: with this routing + prompt caching, a 45-min session should cost well under $0.50.

Prompt text lives in `/prompts`, not here, so prompts can be tuned without redeploying this package.

Status: v0 model calls are implemented for chunked transcription, structured lesson-state
building, and manual fallback. The package validates inputs/model output but still depends
on deployed model credentials at runtime.
