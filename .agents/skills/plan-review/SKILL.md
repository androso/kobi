---
name: plan-review
description: Reviews feature implementation plans with parallel Codex subagents until no blocking objections remain. Use when the user wants a plan critiqued, revised, or made implementation-ready before coding.
---

# Plan Review

Use this skill to critique and revise a feature implementation plan before code is written.

## Inputs

Expect the user to provide a plan path, for example:

```text
$plan-review docs/feature-plan.md
```

If no path is provided, ask for the plan path before starting.

## Workflow

1. Read the plan and relevant project context.
2. Spawn exactly these four reviewer agents in parallel:
   - `architecture-reviewer`
   - `security-reviewer`
   - `test-reviewer`
   - `product-reviewer`
3. Instruct each reviewer to review the plan only. They must not implement code.
4. Wait for all reviewer agents to finish.
5. Send the original plan and all reviewer outputs to `plan-coordinator`.
6. Ask `plan-coordinator` to synthesize a revised plan and convergence report.
7. If any reviewer or the coordinator reports blocking objections, run another review round using the revised plan.
8. Stop when all reviewers approve, when `plan-coordinator` sets `implementation_ready: true`, or after 3 total rounds.
9. If blockers remain after 3 rounds, stop and present the unresolved blockers for human decision.

Do not implement code during this workflow.

## Reviewer Output Contract

Each reviewer should return:

```yaml
verdict: approve | block
blocking_objections:
  - objection:
    why_it_matters:
    required_change:
risks:
  - risk:
    likelihood: low | medium | high
    impact: low | medium | high
required_changes:
  - change
non_blocking_suggestions:
  - suggestion
confidence: low | medium | high
```

Reviewers should only return `block` when the plan should not be implemented as written.

## Coordinator Output Contract

The coordinator should return:

```yaml
convergence_status: converged | blocked | needs_human_decision
implementation_ready: true | false
accepted_objections:
  - objection
rejected_objections:
  - objection:
    rationale:
unresolved_questions:
  - question
revised_implementation_plan:
  summary:
  steps:
  validation_plan:
```

## Blocking Standard

Blocking objections must be concrete and material. Good blockers include:

- Missing design decisions that would cause incompatible implementations.
- Violations of existing architecture, ownership boundaries, or contracts.
- Plausible security, privacy, authorization, or data exposure risks.
- Critical behavior that lacks a reasonable validation path.
- Requirement ambiguity likely to produce the wrong user-facing behavior.

Do not block on style preferences, minor naming choices, speculative risks without a plausible failure path, or nice-to-have polish.

## Fallback

If custom subagent spawning is unavailable, perform the same four reviews sequentially in the current thread, then produce the coordinator synthesis. State that the fallback path was used.
