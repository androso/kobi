import { describe, expect, it } from "vitest";
import { resolveLessonStateClassContext } from "./buildLessonState.job.js";

describe("resolveLessonStateClassContext", () => {
  it("uses explicit class context without querying Supabase", async () => {
    const from = () => {
      throw new Error("should not query");
    };
    await expect(resolveLessonStateClassContext({ from } as never, { sessionId: "session-1", grade: 2, subject: "matemática" }))
      .resolves.toEqual({ grade: 2, subject: "matemática" });
  });

  it("resolves missing context from the session class", async () => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: { classes: { grade: 2, subject: "matemática" } }, error: null }),
    };
    await expect(resolveLessonStateClassContext({ from: () => query } as never, { sessionId: "session-1" }))
      .resolves.toEqual({ grade: 2, subject: "matemática" });
  });
});