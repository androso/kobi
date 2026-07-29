# Agentic artifact generation and sandbox execution

## Runtime contract, not a renderer contract

Kobi asks OpenAI for a strict transport envelope containing `difficulty_band`, `manifest_draft`, and free-form `index_html`. Structured Outputs makes every schema field explicit and required; it does not constrain the HTML app to a predefined family, mechanic, component set, or quiz renderer.

The manifest records curriculum grounding, experience intent, capabilities, runtime content, and telemetry. The model may invent simulations, interactive laboratories, creative studios, guided inquiries, learning games, practice tools, explorations, or another fitting mini-app. Reflection and exploration artifacts may have empty answer keys; scored and mastery artifacts require evaluable grounded answers.

Kobi does not select repository activities or deterministic fallback activities. A generation failure fails closed and publishes nothing.

## Resilient agent loop

1. Request core first, followed by optional support and challenge artifacts.
2. Normalize the structured envelope and statically verify the free-form app code.
3. Execute each artifact in an ephemeral isolated browser sandbox.
4. Return schema, SDK, security, and runtime failures to the model for bounded repair.
5. Send surviving artifacts through a separate pedagogical AI review and bounded review-repair loop.
6. Preserve valid bands instead of discarding the whole result; a verified core artifact may be delivered even when another band exhausts repair.
7. Re-run isolated verification immediately before persistence.
8. Persist and serve only verified model-generated bundles.

Resilience therefore comes from diagnosis, selective repair, partial progress, isolation, and fail-closed persistence—not from replacing creative generation with canned activities.

## Isolated artifact foundry

Production uses Modal Sandboxes with gVisor isolation while retaining the Node worker and React app:

- pinned Playwright/Chromium image;
- zero network egress;
- ephemeral filesystem and sandbox lifecycle;
- short wall-clock timeout and explicit CPU/memory limits;
- SDK host harness that supplies the manifest and band;
- visible real controls exercised for attempt, hint, and completion;
- console, page, protocol, CSP, and telemetry failures returned as structured repair feedback;
- sandbox termination in `finally`.

The student runtime independently uses `iframe sandbox="allow-scripts"` with restrictive CSP. The iframe requests its manifest and band from the trusted host and emits telemetry through `postMessage`; artifact code never receives datastore credentials or direct network access.

## Configuration

- `ACTIVITY_RUNTIME_VERIFIER=modal`
- `MODAL_TOKEN_ID`
- `MODAL_TOKEN_SECRET`
- `MODAL_ACTIVITY_APP=kobi-activity-foundry`
- pinned image containing Node 22, Chromium, and Playwright
- network blocked; 30-second timeout; 0.5 requested/1 CPU limit; 512 MiB requested/1 GiB memory limit

Production defaults to Modal and fails fast when its token pair is absent. Developer environments may use local Playwright. To verify a generated bundle directly after provisioning Modal credentials:

```bash
pnpm --filter @kobi/worker verify:modal-artifact -- path/to/index.html path/to/manifest.json
```
