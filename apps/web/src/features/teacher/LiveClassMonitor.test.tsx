import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveClassMonitor } from "./LiveClassMonitor";
import { useClassStore } from "../../lib/store";

const mocks = vi.hoisted(() => {
  const candidate = {
    id: "candidate-core",
    sessionId: "session-1",
    activityId: "activity-core",
    difficultyBand: "core",
    status: "ready",
    source: "new",
    manifest: {
      family: "guided_practice",
      title: "Practica: La noticia",
      difficulty_band: "core",
      curriculum: { grade: 7, subject: "lenguaje", unit: "U4", objective: "L7.4.2" },
      est_minutes: 6,
      content: {
        items: [{ prompt: "Identifica titular, entradilla y fuente.", answer_key: ["titular"], hints: ["Lee el encabezado."] }],
        telemetry_events: ["attempt", "hint", "complete"],
      },
      entry: "index.html",
      sdk_version: "activity-sdk/v1",
      allowed_capabilities: ["dom", "css"],
    },
    bundleRef: "bundle-core",
    bundleHtml: "<!doctype html><html><body>Actividad</body></html>",
    evidence: [{ objective_code: "L7.4.2", section: "U4", text: "Estructura de la noticia" }],
    verifierScores: {
      deterministic: "pass",
      rubric: {
        curriculum_alignment: 0.95,
        age_fit: 0.9,
        duration_fit: 0.9,
        answer_correctness: 0.9,
        hint_leakage: 0.9,
        duplicate_risk: 0.86,
        spanish_suitability: 0.9,
      },
    },
  };

  return {
    candidate,
    listStudents: vi.fn(async () => [{ id: "student-1", displayName: "Ana" }]),
    requestActivityCandidates: vi.fn(async () => ({ inserted: 1, reused: 0, generated: 0, skippedReason: null })),
    publishAssignments: vi.fn(async () => [
      {
        id: "assignment-1",
        sessionId: "session-1",
        activityId: "activity-core",
        studentId: "student-1",
        variant: "core",
      },
    ]),
    createBackendSession: vi.fn(async () => ({ sessionId: "session-1" })),
    submitDemoTranscript: vi.fn(async () => [
      { audioChunkId: "chunk-0", chunkIndex: 0, totalChunks: 2, done: false },
      { audioChunkId: "chunk-1", chunkIndex: 1, totalChunks: 2, done: true },
    ]),
    supabaseFrom: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    })),
    realtimeHandlers: [] as Array<() => void>,
    subscribe: vi.fn(),
    removeChannel: vi.fn(async () => "ok"),
  };
});

vi.mock("../../lib/supabase", () => ({
  supabase: {
    from: mocks.supabaseFrom,
    channel: vi.fn(() => ({
      on: vi.fn((_type, _config, handler) => {
        mocks.realtimeHandlers.push(handler);
        return { subscribe: mocks.subscribe };
      }),
    })),
    removeChannel: mocks.removeChannel,
  },
}));

vi.mock("../../lib/audioApi", () => ({
  createBackendSession: mocks.createBackendSession,
  isAudioApiConfigured: () => true,
  isDemoProjectMode: () => true,
  requestActivityCandidates: mocks.requestActivityCandidates,
  resolveBackendClassId: (classId: string) => classId,
  submitDemoTranscript: mocks.submitDemoTranscript,
  submitManualLessonState: vi.fn(),
  uploadAudioChunk: vi.fn(),
}));

vi.mock("../activityDelivery/artifactDelivery", () => ({
  SupabaseActivityDeliveryStore: class {
    listStudents = mocks.listStudents;
    listCandidates = vi.fn(async () => [mocks.candidate]);
  },
  publishAssignments: mocks.publishAssignments,
}));

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  mocks.realtimeHandlers.length = 0;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: undefined,
  });
});

describe("LiveClassMonitor activity delivery", () => {
  it("shows an honest empty analysis state without mock lesson metrics", () => {
    useClassStore.getState().resetClasses();
    useClassStore.getState().startMonitoring("class-1");

    render(
      <MemoryRouter>
        <LiveClassMonitor />
      </MemoryRouter>,
    );

    expect(screen.getByText(/esperando análisis de la sesión/i)).toBeInTheDocument();
    expect(screen.queryByText(/^ecosistemas$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/pulso de participación/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^hora de actividad$/i })).toBeInTheDocument();
  });

  it("renders generated candidates and publishes assignments", async () => {
    const user = userEvent.setup();
    useClassStore.getState().resetClasses();
    useClassStore.getState().startMonitoring("class-1");

    render(
      <MemoryRouter>
        <LiveClassMonitor />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /hora de actividad/i }));

    expect(await screen.findByRole("heading", { name: /aprobar y entregar actividad/i })).toBeInTheDocument();
    expect(screen.getByText("Practica: La noticia")).toBeInTheDocument();
    expect(screen.getByText(/Estructura de la noticia/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /publicar a estudiantes/i }));

    expect(mocks.publishAssignments).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        classId: "class-1",
        approvedBands: ["core"],
      }),
    );
    expect(await screen.findByText(/Publicado para 1 estudiantes/i)).toBeInTheDocument();
  });

  it("processes the full demo transcript from Iniciar grabacion without requesting microphone access", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn() },
    });

    useClassStore.getState().resetClasses();
    useClassStore.getState().startMonitoring("class-1");

    render(
      <MemoryRouter>
        <LiveClassMonitor />
      </MemoryRouter>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /iniciar grabación/i }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.createBackendSession).toHaveBeenCalledWith({ classId: "class-1" });
    expect(mocks.submitDemoTranscript).toHaveBeenCalledWith({ sessionId: "session-1" });
    expect(navigator.mediaDevices?.getUserMedia).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /pausar/i })).toBeInTheDocument();
  });

  it("loads the artifact flow directly after pausing without opening the session summary", async () => {
    useClassStore.getState().resetClasses();
    useClassStore.getState().startMonitoring("class-1");

    render(
      <MemoryRouter>
        <LiveClassMonitor />
      </MemoryRouter>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /iniciar grabación/i }));
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: /pausar/i }));

    expect(screen.queryByText(/sesión finalizada/i)).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /aprobar y entregar actividad/i })).toBeInTheDocument();
  });
});
