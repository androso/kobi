import { describe, expect, it, vi } from "vitest";
import { closeTeacherSession, loadSessionReports, REPORT_PAGE_SIZE } from "./sessionReports";

describe("loadSessionReports", () => {
  it("loads a bounded persisted page without waiting for realtime", async () => {
    const report = { id: "session-1", total_count: 1 };
    const rpc = vi.fn(async () => ({ data: [{ report }], error: null }));
    const result = await loadSessionReports({ rpc } as never, 2, "class-1");
    expect(result).toEqual([report]);
    expect(rpc).toHaveBeenCalledWith("list_teacher_session_reports", expect.objectContaining({
      input_class_id: "class-1", input_limit: REPORT_PAGE_SIZE, input_offset: REPORT_PAGE_SIZE * 2,
    }));
  });

  it("surfaces database ownership and range errors", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: new Error("Class is not owned by this teacher") }));
    await expect(loadSessionReports({ rpc } as never, 0)).rejects.toThrow("Class is not owned");
  });
});

describe("closeTeacherSession", () => {
  it("closes through the server-clock RPC", async () => {
    const rpc = vi.fn(async () => ({ data: [{ id: "session-1", ended_at: "2026-07-13T12:00:00.000Z" }], error: null }));
    const client = { rpc };

    await closeTeacherSession(client as never, "session-1");

    expect(rpc).toHaveBeenCalledWith("close_teacher_session", { input_session_id: "session-1" });
  });

  it("surfaces a failed authorized close", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: new Error("permission denied") }));

    await expect(closeTeacherSession({ rpc } as never, "session-1"))
      .rejects.toThrow("permission denied");
  });

  it("rejects an RPC that did not close an active session", async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));

    await expect(closeTeacherSession({ rpc } as never, "session-1"))
      .rejects.toThrow("Session was not closed");
  });
});
