import { afterEach, describe, expect, it, vi } from "vitest";
import { requestActivityCandidates } from "./audioApi";

vi.mock("./supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: "test-access-token" } },
        error: null,
      })),
    },
  },
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("requestActivityCandidates", () => {
  it("retries while lesson_state is still being built", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "No lesson_state is available for this session yet." }), {
          status: 409,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ inserted: 3, reused: 0, generated: 3, skippedReason: null }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = requestActivityCandidates({ sessionId: "session-1" });
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(resultPromise).resolves.toEqual({
      inserted: 3,
      reused: 0,
      generated: 3,
      skippedReason: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
