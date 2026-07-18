import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    listCandidates: vi.fn(async (_sessionId: string) => [candidate]),
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
    submitManualLessonState: vi.fn(async () => {}),
    uploadAudioChunk: vi.fn(async () => {}),
    supabaseRpc: vi.fn(async () => ({ data: [{ id: "session-1" }], error: null })),
    supabaseFrom: vi.fn(() => ({
      update: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    })),
  };
});

vi.mock("../../lib/supabase", () => ({ supabase: { from: mocks.supabaseFrom, rpc: mocks.supabaseRpc } }));

vi.mock("../../lib/audioApi", () => ({
  createBackendSession: mocks.createBackendSession,
  isAudioApiConfigured: () => true,
  requestActivityCandidates: mocks.requestActivityCandidates,
  resolveBackendClassId: (classId: string) => classId,
  submitManualLessonState: mocks.submitManualLessonState,
  uploadAudioChunk: mocks.uploadAudioChunk,
}));

vi.mock("../activityDelivery/artifactDelivery", () => ({
  SupabaseActivityDeliveryStore: class {
    listStudents = mocks.listStudents;
    listCandidates = mocks.listCandidates;
  },
  publishAssignments: mocks.publishAssignments,
}));

function installFakeBrowserRecorder() {
  const stopTrack = vi.fn();
  const stream = {
    getAudioTracks: () => [{}],
    getTracks: () => [{ stop: stopTrack }],
  };
  const getUserMedia = vi.fn(async () => stream);

  class FakeMediaRecorder {
    state: RecordingState = "inactive";
    mimeType = "audio/webm";
    ondataavailable: ((event: BlobEvent) => void) | null = null;
    onerror: (() => void) | null = null;
    onstop: ((event: Event) => void) | null = null;
    private stopListener: EventListener | null = null;

    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (type !== "stop") return;
      this.stopListener = typeof listener === "function"
        ? listener
        : (event) => listener.handleEvent(event);
    }

    start() {
      this.state = "recording";
    }

    stop() {
      this.state = "inactive";
      queueMicrotask(() => {
        this.ondataavailable?.({ data: new Blob(["final audio"], { type: this.mimeType }) } as BlobEvent);
        const event = new Event("stop");
        this.onstop?.(event);
        this.stopListener?.(event);
      });
    }
  }

  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);

  return { getUserMedia, stopTrack };
}

beforeEach(() => {
  mocks.createBackendSession.mockReset().mockResolvedValue({ sessionId: "session-1" });
  mocks.listCandidates.mockResolvedValue([mocks.candidate]);
  mocks.requestActivityCandidates.mockResolvedValue({ inserted: 1, reused: 0, generated: 0, skippedReason: null });
  mocks.submitManualLessonState.mockResolvedValue(undefined);
  mocks.uploadAudioChunk.mockResolvedValue(undefined);
  mocks.supabaseRpc.mockResolvedValue({ data: [{ id: "session-1" }], error: null });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
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
    const preview = screen.getByTitle(/previsualizacion practica: la noticia/i);
    expect(preview).toHaveAttribute("sandbox", "allow-scripts");
    expect(preview).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(preview.getAttribute("srcdoc")).toContain("Content-Security-Policy");

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
  it("loads the artifact flow directly after stopping without opening the session summary", async () => {
    installFakeBrowserRecorder();
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

    fireEvent.click(screen.getByRole("button", { name: /detener/i }));

    expect(screen.queryByText(/sesión finalizada/i)).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /aprobar y entregar actividad/i })).toBeInTheDocument();
  });

  it("creates a fresh backend session after closing a recording", async () => {
    installFakeBrowserRecorder();
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
    expect(mocks.createBackendSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /detener/i }));
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /iniciar grabación/i }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.createBackendSession).toHaveBeenCalledTimes(2);
    expect(mocks.supabaseRpc).toHaveBeenCalledWith("close_teacher_session", { input_session_id: "session-1" });
  });

  it("retries activity generation for the completed session instead of creating an empty one", async () => {
    installFakeBrowserRecorder();
    mocks.listCandidates
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([mocks.candidate]);
    mocks.requestActivityCandidates
      .mockRejectedValueOnce(new Error("lesson state is not ready"))
      .mockResolvedValueOnce({ inserted: 1, reused: 0, generated: 0, skippedReason: null });
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
    fireEvent.click(screen.getByRole("button", { name: /detener/i }));

    expect(await screen.findByText("lesson state is not ready")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^hora de actividad$/i }));

    expect(await screen.findByRole("heading", { name: /aprobar y entregar actividad/i })).toBeInTheDocument();
    expect(mocks.requestActivityCandidates).toHaveBeenNthCalledWith(1, { sessionId: "session-1" });
    expect(mocks.requestActivityCandidates).toHaveBeenNthCalledWith(2, { sessionId: "session-1" });
    expect(mocks.createBackendSession).toHaveBeenCalledTimes(1);
  });

  it("uploads the final MediaRecorder blob before closing the session", async () => {
    const { stopTrack } = installFakeBrowserRecorder();
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
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /detener/i }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.uploadAudioChunk).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "session-1",
      audio: expect.any(Blob),
      chunkIndex: 0,
    }));
    expect(mocks.uploadAudioChunk.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.supabaseRpc.mock.invocationCallOrder[0]);
    expect(stopTrack).toHaveBeenCalled();
  });

  it("keeps recording restart disabled until the previous session close settles", async () => {
    installFakeBrowserRecorder();
    let resolveClose!: (value: { data: Array<{ id: string }>; error: null }) => void;
    mocks.supabaseRpc.mockImplementationOnce(() => new Promise((resolve) => {
      resolveClose = resolve;
    }));
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
    fireEvent.click(screen.getByRole("button", { name: /detener/i }));

    const finalizingButton = await screen.findByRole("button", { name: /finalizando sesión/i });
    expect(finalizingButton).toBeDisabled();
    fireEvent.click(finalizingButton);
    expect(mocks.createBackendSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveClose({ data: [{ id: "session-1" }], error: null });
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByRole("button", { name: /iniciar grabación/i })).toBeEnabled());
  });

  it("clears the previous activity flow before starting a new recording", async () => {
    installFakeBrowserRecorder();
    mocks.createBackendSession
      .mockResolvedValueOnce({ sessionId: "session-1" })
      .mockResolvedValueOnce({ sessionId: "session-2" });
    mocks.listCandidates.mockImplementation(async (sessionId: string) => (
      sessionId === "session-1" ? [mocks.candidate] : []
    ));
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
    fireEvent.click(screen.getByRole("button", { name: /detener/i }));
    expect(await screen.findByRole("heading", { name: /aprobar y entregar actividad/i })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /iniciar grabación/i }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.createBackendSession).toHaveBeenNthCalledWith(2, { classId: "class-1" });
    expect(screen.queryByRole("heading", { name: /aprobar y entregar actividad/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /publicar a estudiantes/i })).not.toBeInTheDocument();
  });

  it("writes manual fallback lesson state to the completed recording session", async () => {
    installFakeBrowserRecorder();
    const user = userEvent.setup();
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
    fireEvent.click(screen.getByRole("button", { name: /detener/i }));
    await screen.findByRole("heading", { name: /aprobar y entregar actividad/i });

    await user.click(screen.getByRole("button", { name: /escribir tema manualmente/i }));
    await user.type(screen.getByRole("textbox", { name: /tema que estas dando/i }), "La noticia");
    await user.type(screen.getByRole("textbox", { name: /^objetivo$/i }), "Identificar sus partes");
    await user.click(screen.getByRole("button", { name: /guardar tema/i }));

    await waitFor(() => expect(mocks.submitManualLessonState).toHaveBeenCalledWith({
      sessionId: "session-1",
      topic: "La noticia",
      objective: "Identificar sus partes",
    }));
    expect(mocks.createBackendSession).toHaveBeenCalledTimes(1);
  });
});
