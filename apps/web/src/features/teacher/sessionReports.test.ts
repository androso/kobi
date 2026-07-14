import { describe, expect, it, vi } from "vitest";
import { closeTeacherSession, loadSessionReports, REPORT_PAGE_SIZE } from "./sessionReports";

function updateChain(result: { data: unknown; error: unknown }) {
  const chain = {
    update: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    select: vi.fn(() => chain),
    single: vi.fn(async () => result),
  };
  return chain;
}

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
  it("closes only an active session through the teacher-owned update path", async () => {
    const chain = updateChain({ data: { id: "session-1" }, error: null });
    const client = { from: vi.fn(() => chain) };

    await closeTeacherSession(client as never, "session-1", "2026-07-13T12:00:00.000Z");

    expect(client.from).toHaveBeenCalledWith("sessions");
    expect(chain.update).toHaveBeenCalledWith({ status: "ended", ended_at: "2026-07-13T12:00:00.000Z" });
    expect(chain.eq).toHaveBeenNthCalledWith(1, "id", "session-1");
    expect(chain.eq).toHaveBeenNthCalledWith(2, "status", "active");
    expect(chain.select).toHaveBeenCalledWith("id");
  });

  it("surfaces a failed authorized close", async () => {
    const chain = updateChain({ data: null, error: new Error("permission denied") });

    await expect(closeTeacherSession({ from: vi.fn(() => chain) } as never, "session-1"))
      .rejects.toThrow("permission denied");
  });
});
