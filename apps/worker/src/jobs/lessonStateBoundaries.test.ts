import { describe, expect, it } from "vitest";
import { assertSupportedClassContext, lessonStateSchema } from "@kobi/ai-core";

describe("lesson-state boundaries", () => {
  it("accepts the ratified v0 class context", () => {
    expect(() => assertSupportedClassContext({
      grade: 7,
      subject: "Lenguaje",
      unit: "U4",
      locale: "es-SV",
    })).not.toThrow();
  });

  it.each([
    { grade: 8, subject: "lenguaje", unit: "U4", locale: "es-SV" as const },
    { grade: 7, subject: "matematicas", unit: "U4", locale: "es-SV" as const },
    { grade: 7, subject: "lenguaje", unit: "", locale: "es-SV" as const },
  ])("rejects unsupported class context explicitly", (classContext) => {
    expect(() => assertSupportedClassContext(classContext)).toThrow("unsupported class context");
  });

  it("rejects oversized model output", () => {
    expect(() => lessonStateSchema.parse({
      topic: "x".repeat(161),
      objective_guess: null,
      key_terms: [],
      transcript_summary: "Resumen",
      confidence: 0.5,
      evidence: { quoted_phrases: [], reason: "Razón" },
    })).toThrow();
  });
});
