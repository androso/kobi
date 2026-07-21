import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionReport } from "./sessionReports";
import { PreviousClasses } from "./PreviousClasses";

const mocks = vi.hoisted(() => {
  const callbacks = new Map<string, () => void>();
  const channel: Record<string, unknown> = {};
  channel.on = vi.fn((
    _event: string,
    filter: { table: string },
    callback: () => void,
  ) => {
    callbacks.set(filter.table, callback);
    return channel;
  });
  channel.subscribe = vi.fn(() => channel);

  return {
    callbacks,
    channel,
    loadSessionReports: vi.fn(),
    removeChannel: vi.fn(async () => {}),
    supabaseChannel: vi.fn(() => channel),
  };
});

vi.mock("../../lib/supabase", () => ({
  supabase: {
    channel: mocks.supabaseChannel,
    removeChannel: mocks.removeChannel,
  },
}));

vi.mock("./sessionReports", async (importOriginal) => ({
  ...await importOriginal<typeof import("./sessionReports")>(),
  loadSessionReports: mocks.loadSessionReports,
}));

function report(className: string): SessionReport {
  return {
    id: `session-${className}`,
    class_id: "class-1",
    class_name: className,
    subject: "Lenguaje",
    unit: "U4",
    status: "ended",
    started_at: "2026-07-18T12:00:00.000Z",
    ended_at: "2026-07-18T12:30:00.000Z",
    duration_seconds: 1800,
    topics: ["La noticia"],
    objective: "Identificar las partes de una noticia",
    assignment_count: 1,
    completed_count: 1,
    completion_rate: 1,
    average_score: 1,
    score_distribution: { low: 0, middle: 0, high: 1 },
    hints: 0,
    difficult_items: [],
    band_outcomes: { core: { assigned: 1, completed: 1, average_score: 1 } },
    total_count: 1,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

beforeEach(() => {
  mocks.callbacks.clear();
  mocks.loadSessionReports.mockReset().mockResolvedValue([]);
  mocks.supabaseChannel.mockClear();
  mocks.removeChannel.mockClear();
  (mocks.channel.on as ReturnType<typeof vi.fn>).mockClear();
  (mocks.channel.subscribe as ReturnType<typeof vi.fn>).mockClear();
});

describe("PreviousClasses report refresh", () => {
  it("reloads reports when tenant-visible segments or events arrive", async () => {
    render(
      <MemoryRouter>
        <PreviousClasses />
      </MemoryRouter>,
    );

    await waitFor(() => expect(mocks.loadSessionReports).toHaveBeenCalledTimes(1));
    expect(mocks.callbacks.has("segments")).toBe(true);

    act(() => mocks.callbacks.get("segments")?.());

    await waitFor(() => expect(mocks.loadSessionReports).toHaveBeenCalledTimes(2));

    act(() => mocks.callbacks.get("events")?.());

    await waitFor(() => expect(mocks.loadSessionReports).toHaveBeenCalledTimes(3));
  });

  it("does not let an older report request overwrite a newer realtime reload", async () => {
    const first = deferred<SessionReport[]>();
    const second = deferred<SessionReport[]>();
    mocks.loadSessionReports
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    render(
      <MemoryRouter>
        <PreviousClasses />
      </MemoryRouter>,
    );

    await waitFor(() => expect(mocks.loadSessionReports).toHaveBeenCalledTimes(1));
    act(() => mocks.callbacks.get("sessions")?.());
    await waitFor(() => expect(mocks.loadSessionReports).toHaveBeenCalledTimes(2));

    await act(async () => {
      second.resolve([report("Reporte actual")]);
      await Promise.resolve();
    });
    expect(await screen.findByText("Reporte actual")).toBeInTheDocument();

    await act(async () => {
      first.resolve([report("Reporte obsoleto")]);
      await Promise.resolve();
    });
    expect(screen.getByText("Reporte actual")).toBeInTheDocument();
    expect(screen.queryByText("Reporte obsoleto")).not.toBeInTheDocument();
  });
});
