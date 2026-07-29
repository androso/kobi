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
    finalizeBackendSession: vi.fn(async () => ({
      sessionId: "session-1",
      finalizationEnqueued: true,
    })),
    recordingSource: "microphone" as "microphone" | "prerecorded",
    uploadAudioChunk: vi.fn(async () => ({ audioChunkId: "uploaded-chunk" })),
    getTranscriptionStatus: vi.fn(async (_input: {
      sessionId: string;
      expectedChunks: number;
      signal?: AbortSignal;
    }) => ({
      expectedChunks: 2,
      uploaded: 2,
      pending: 0,
      transcribing: 0,
      transcribed: 2,
      spokenChunks: 2,
      terminalFailed: 0,
      lessonStateThroughChunkIndex: 1 as number | null,
      complete: true,
    })),
    decodePrerecordedAudio: vi.fn(async () => [
      { audio: new Blob(["one"], { type: "audio/wav" }), chunkIndex: 0, startMs: 0, endMs: 15_000 },
      { audio: new Blob(["two"], { type: "audio/wav" }), chunkIndex: 1, startMs: 15_000, endMs: 22_000 },
    ]),
    submitManualLessonState: vi.fn(async () => {}),
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
  finalizeBackendSession: mocks.finalizeBackendSession,
  getPrerecordedAudioPath: () => "/local-audio/demo-audio.mp3",
  getRecordingSource: () => mocks.recordingSource,
  getTranscriptionStatus: mocks.getTranscriptionStatus,
  isAudioApiConfigured: () => true,
  requestActivityCandidates: mocks.requestActivityCandidates,
  resolveBackendClassId: (classId: string) => classId,
  submitManualLessonState: mocks.submitManualLessonState,
  uploadAudioChunk: mocks.uploadAudioChunk,
}));

vi.mock("../../lib/prerecordedAudio", () => ({
  decodePrerecordedAudio: mocks.decodePrerecordedAudio,
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

function dispatchActivityMessage(data: unknown, source: MessageEventSource) {
  const event = new MessageEvent("message", { data });
  Object.defineProperty(event, "source", { value: source });
  fireEvent(window, event);
}

beforeEach(() => {
  mocks.createBackendSession.mockReset().mockResolvedValue({ sessionId: "session-1" });
  mocks.finalizeBackendSession.mockReset().mockResolvedValue({
    sessionId: "session-1",
    finalizationEnqueued: true,
  });
  mocks.listCandidates.mockResolvedValue([mocks.candidate]);
  mocks.requestActivityCandidates.mockResolvedValue({ inserted: 1, reused: 0, generated: 0, skippedReason: null });
  mocks.submitManualLessonState.mockResolvedValue(undefined);
  mocks.uploadAudioChunk.mockResolvedValue({ audioChunkId: "uploaded-chunk" });
  mocks.supabaseRpc.mockResolvedValue({ data: [{ id: "session-1" }], error: null });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mocks.recordingSource = "microphone";
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
  it("answers preview SDK requests only for its iframe and ignores telemetry", async () => {
    const user = userEvent.setup();
    useClassStore.getState().resetClasses();
    useClassStore.getState().startMonitoring("class-1");
    const supportCandidate = {
      ...mocks.candidate,
      id: "candidate-support",
      activityId: "activity-support",
      difficultyBand: "support",
      bundleRef: "bundle-support",
      manifest: {
        ...mocks.candidate.manifest,
        title: "Practica: La noticia - Apoyo",
        difficulty_band: "support",
      },
    };
    mocks.listCandidates.mockResolvedValue([mocks.candidate, supportCandidate]);


    const view = render(
      <MemoryRouter>
        <LiveClassMonitor />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: /hora de actividad/i }));

    const preview = await screen.findByTitle(/previsualizacion practica: la noticia/i) as HTMLIFrameElement;
    const sourceWindow = preview.contentWindow;
    expect(sourceWindow).not.toBeNull();
    if (!sourceWindow) return;
    const postMessage = vi.spyOn(sourceWindow, "postMessage");

    dispatchActivityMessage(
      { sdk: "activity-sdk/v1", type: "request", id: "manifest-1", method: "getManifest" },
      sourceWindow,
    );
    dispatchActivityMessage(
      { sdk: "activity-sdk/v1", type: "request", id: "band-1", method: "getBand" },
      sourceWindow,
    );

    expect(postMessage).toHaveBeenNthCalledWith(1, {
      sdk: "activity-sdk/v1",
      type: "response",
      id: "manifest-1",
      ok: true,
      result: mocks.candidate.manifest,
    }, "*");
    expect(postMessage).toHaveBeenNthCalledWith(2, {
      sdk: "activity-sdk/v1",
      type: "response",
      id: "band-1",
      ok: true,
      result: "core",
    }, "*");

    dispatchActivityMessage(
      { sdk: "activity-sdk/v1", type: "request", id: "foreign", method: "getManifest" },
      window,
    );
    dispatchActivityMessage({
      sdk: "activity-sdk/v1",
      type: "event",
      method: "reportAttempt",
      payload: { item_index: 0, correct: true },
    }, sourceWindow);
    expect(postMessage).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole("button", { name: "Previsualizar" }));
    const supportPreview = await screen.findByTitle(/previsualizacion practica: la noticia - apoyo/i) as HTMLIFrameElement;
    const supportSourceWindow = supportPreview.contentWindow;
    expect(supportSourceWindow).not.toBeNull();
    if (!supportSourceWindow) return;
    const supportPostMessage = vi.spyOn(supportSourceWindow, "postMessage");

    dispatchActivityMessage(
      { sdk: "activity-sdk/v1", type: "request", id: "stale-core", method: "getBand" },
      sourceWindow,
    );
    expect(postMessage).toHaveBeenCalledTimes(2);
    dispatchActivityMessage(
      { sdk: "activity-sdk/v1", type: "request", id: "support-band", method: "getBand" },
      supportSourceWindow,
    );
    expect(supportPostMessage).toHaveBeenCalledWith({
      sdk: "activity-sdk/v1",
      type: "response",
      id: "support-band",
      ok: true,
      result: "support",
    }, "*");

    view.unmount();
    dispatchActivityMessage(
      { sdk: "activity-sdk/v1", type: "request", id: "stale-unmounted", method: "getBand" },
      supportSourceWindow,
    );
    expect(supportPostMessage).toHaveBeenCalledTimes(1);
  });

  it("uploads prerecorded WAV chunks without requesting microphone access", async () => {
    vi.useFakeTimers();
    mocks.recordingSource = "prerecorded";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))));
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

    fireEvent.click(screen.getByRole("button", { name: /iniciar demo/i }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(2_100);
      await Promise.resolve();
    });

    expect(navigator.mediaDevices?.getUserMedia).not.toHaveBeenCalled();
    expect(mocks.decodePrerecordedAudio).toHaveBeenCalled();
    expect(mocks.uploadAudioChunk).toHaveBeenNthCalledWith(1, expect.objectContaining({
      chunkIndex: 0,
      startMs: 0,
      endMs: 15_000,
    }));
    expect(mocks.uploadAudioChunk).toHaveBeenNthCalledWith(2, expect.objectContaining({
      chunkIndex: 1,
      startMs: 15_000,
      endMs: 22_000,
    }));
    expect(mocks.getTranscriptionStatus).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "session-1",
      expectedChunks: 2,
    }));
  });

  it("shows prerecorded audio as processed after transcription and activity generation finish", async () => {
    mocks.recordingSource = "prerecorded";
    mocks.decodePrerecordedAudio.mockResolvedValueOnce([
      { audio: new Blob(["one"], { type: "audio/wav" }), chunkIndex: 0, startMs: 0, endMs: 10_000 },
    ]);
    mocks.getTranscriptionStatus.mockResolvedValueOnce({
      expectedChunks: 1,
      uploaded: 1,
      pending: 0,
      transcribing: 0,
      transcribed: 1,
      spokenChunks: 1,
      terminalFailed: 0,
      lessonStateThroughChunkIndex: 0,
      complete: true,
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]))));
    useClassStore.getState().resetClasses();
    useClassStore.getState().startMonitoring("class-1");

    render(
      <MemoryRouter>
        <LiveClassMonitor />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /iniciar demo/i }));

    expect(await screen.findByText("Audio procesado")).toBeInTheDocument();
    expect(screen.getByText("Sesión procesada")).toBeInTheDocument();
    expect(screen.getByText(/sesion enviada al worker · 1 fragmento procesado/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Transcribiendo$/i)).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /aprobar y entregar actividad/i })).toBeInTheDocument();
  });

  it("creates a fresh backend session when prerecorded playback starts again", async () => {
    mocks.recordingSource = "prerecorded";
    mocks.createBackendSession
      .mockResolvedValueOnce({ sessionId: "session-1" })
      .mockResolvedValueOnce({ sessionId: "session-2" });
    const chunks = [
      { audio: new Blob(["one"], { type: "audio/wav" }), chunkIndex: 0, startMs: 0, endMs: 10_000 },
    ];
    const completeStatus = {
      expectedChunks: 1,
      uploaded: 1,
      pending: 0,
      transcribing: 0,
      transcribed: 1,
      spokenChunks: 1,
      terminalFailed: 0,
      lessonStateThroughChunkIndex: 0,
      complete: true,
    };
    mocks.decodePrerecordedAudio
      .mockResolvedValueOnce(chunks)
      .mockResolvedValueOnce(chunks);
    mocks.getTranscriptionStatus
      .mockResolvedValueOnce(completeStatus)
      .mockResolvedValueOnce(completeStatus);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]))));
    useClassStore.getState().resetClasses();
    useClassStore.getState().startMonitoring("class-1");

    render(
      <MemoryRouter>
        <LiveClassMonitor />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /iniciar demo/i }));
    await waitFor(() => expect(mocks.uploadAudioChunk).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /iniciar demo/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /iniciar demo/i }));

    await waitFor(() => expect(mocks.createBackendSession).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mocks.uploadAudioChunk).toHaveBeenCalledTimes(2));
    expect(mocks.uploadAudioChunk).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ sessionId: "session-1", chunkIndex: 0 }),
    );
    expect(mocks.uploadAudioChunk).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sessionId: "session-2", chunkIndex: 0 }),
    );
  });

  it("clears stale activity delivery state when a prerecorded session starts", async () => {
    mocks.recordingSource = "prerecorded";
    let resolveFreshSession!: (value: { sessionId: string }) => void;
    mocks.createBackendSession
      .mockResolvedValueOnce({ sessionId: "session-1" })
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFreshSession = resolve;
      }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]))));
    useClassStore.getState().resetClasses();
    useClassStore.getState().startMonitoring("class-1");

    render(
      <MemoryRouter>
        <LiveClassMonitor />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /hora de actividad/i }));
    expect(await screen.findByText("Practica: La noticia")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /iniciar demo/i }));
    await waitFor(() => {
      expect(screen.queryByText("Practica: La noticia")).not.toBeInTheDocument();
    });

    resolveFreshSession({ sessionId: "session-2" });
    await waitFor(() => expect(mocks.uploadAudioChunk).toHaveBeenCalled());
  });

  it("ignores duplicate prerecorded starts while session creation is pending", async () => {
    mocks.recordingSource = "prerecorded";
    let resolveSession!: (value: { sessionId: string }) => void;
    mocks.createBackendSession.mockImplementationOnce(() => new Promise((resolve) => {
      resolveSession = resolve;
    }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]))));
    useClassStore.getState().resetClasses();
    useClassStore.getState().startMonitoring("class-1");

    render(
      <MemoryRouter>
        <LiveClassMonitor />
      </MemoryRouter>,
    );

    const startButton = screen.getByRole("button", { name: /iniciar demo/i });
    fireEvent.click(startButton);
    fireEvent.click(startButton);

    expect(mocks.createBackendSession).toHaveBeenCalledTimes(1);

    resolveSession({ sessionId: "session-1" });
    await waitFor(() => expect(mocks.uploadAudioChunk).toHaveBeenCalled());
  });

  it("does not generate an activity when prerecorded transcription fails", async () => {
    mocks.recordingSource = "prerecorded";
    mocks.decodePrerecordedAudio.mockResolvedValueOnce([
      { audio: new Blob(["one"], { type: "audio/wav" }), chunkIndex: 0, startMs: 0, endMs: 10_000 },
    ]);
    mocks.getTranscriptionStatus.mockResolvedValueOnce({
      expectedChunks: 1,
      uploaded: 1,
      pending: 0,
      transcribing: 0,
      transcribed: 0,
      spokenChunks: 0,
      terminalFailed: 1,
      lessonStateThroughChunkIndex: null,
      complete: false,
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]))));
    useClassStore.getState().resetClasses();
    useClassStore.getState().startMonitoring("class-1");

    render(
      <MemoryRouter>
        <LiveClassMonitor />
      </MemoryRouter>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /iniciar demo/i }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(await screen.findByText(/no se pudieron transcribir/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /hora de actividad/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /hora de actividad/i }));
    expect(mocks.requestActivityCandidates).not.toHaveBeenCalled();
  });

  it("does not generate an activity when prerecorded audio contains no speech", async () => {
    mocks.recordingSource = "prerecorded";
    mocks.decodePrerecordedAudio.mockResolvedValueOnce([
      { audio: new Blob(["silence"], { type: "audio/wav" }), chunkIndex: 0, startMs: 0, endMs: 10_000 },
    ]);
    mocks.getTranscriptionStatus.mockResolvedValueOnce({
      expectedChunks: 1,
      uploaded: 1,
      pending: 0,
      transcribing: 0,
      transcribed: 1,
      spokenChunks: 0,
      terminalFailed: 0,
      lessonStateThroughChunkIndex: 0,
      complete: true,
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]))));
    useClassStore.getState().resetClasses();
    useClassStore.getState().startMonitoring("class-1");

    render(
      <MemoryRouter>
        <LiveClassMonitor />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /iniciar demo/i }));

    expect(await screen.findByText(/no se detecto voz/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /hora de actividad/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /hora de actividad/i }));
    expect(mocks.requestActivityCandidates).not.toHaveBeenCalled();
  });

  it("reuses the active transcription poll when stopping after all chunks upload", async () => {
    mocks.recordingSource = "prerecorded";
    let resolveStatus!: (value: Awaited<ReturnType<typeof mocks.getTranscriptionStatus>>) => void;
    mocks.decodePrerecordedAudio.mockResolvedValueOnce([
      { audio: new Blob(["one"], { type: "audio/wav" }), chunkIndex: 0, startMs: 0, endMs: 10_000 },
    ]);
    mocks.getTranscriptionStatus.mockImplementationOnce(() => new Promise((resolve) => {
      resolveStatus = resolve;
    }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]))));
    useClassStore.getState().resetClasses();
    useClassStore.getState().startMonitoring("class-1");

    render(
      <MemoryRouter>
        <LiveClassMonitor />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /iniciar demo/i }));
    await waitFor(() => expect(mocks.getTranscriptionStatus).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /detener/i }));
    expect(mocks.getTranscriptionStatus).toHaveBeenCalledTimes(1);

    resolveStatus({
      expectedChunks: 1,
      uploaded: 1,
      pending: 0,
      transcribing: 0,
      transcribed: 1,
      spokenChunks: 1,
      terminalFailed: 0,
      lessonStateThroughChunkIndex: 0,
      complete: true,
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /iniciar demo/i })).toBeInTheDocument();
    });
    expect(mocks.getTranscriptionStatus).toHaveBeenCalledTimes(1);
  });

  it("aborts active transcription polling when the monitor unmounts", async () => {
    mocks.recordingSource = "prerecorded";
    let pollingSignal: AbortSignal | undefined;
    mocks.decodePrerecordedAudio.mockResolvedValueOnce([
      { audio: new Blob(["one"], { type: "audio/wav" }), chunkIndex: 0, startMs: 0, endMs: 10_000 },
    ]);
    mocks.getTranscriptionStatus.mockImplementationOnce(({ signal }) => {
      pollingSignal = signal;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]))));
    useClassStore.getState().resetClasses();
    useClassStore.getState().startMonitoring("class-1");

    const { unmount } = render(
      <MemoryRouter>
        <LiveClassMonitor />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /iniciar demo/i }));
    await waitFor(() => expect(mocks.getTranscriptionStatus).toHaveBeenCalledTimes(1));

    unmount();

    expect(pollingSignal?.aborted).toBe(true);
  });

  it("blocks activity generation when prerecorded playback stops before any upload", async () => {
    mocks.recordingSource = "prerecorded";
    vi.stubGlobal("fetch", vi.fn((_input, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    })));
    useClassStore.getState().resetClasses();
    useClassStore.getState().startMonitoring("class-1");

    render(
      <MemoryRouter>
        <LiveClassMonitor />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /iniciar demo/i }));
    await screen.findByRole("button", { name: /detener/i });
    fireEvent.click(screen.getByRole("button", { name: /detener/i }));

    expect(await screen.findByText(/no se envio ningun fragmento/i)).toBeInTheDocument();
    expect(mocks.uploadAudioChunk).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /hora de actividad/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /hora de actividad/i }));
    expect(mocks.requestActivityCandidates).not.toHaveBeenCalled();
  });

  it("stops queuing prerecorded chunks and finalizes the accepted prefix", async () => {
    mocks.recordingSource = "prerecorded";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]))));
    useClassStore.getState().resetClasses();
    useClassStore.getState().startMonitoring("class-1");

    render(
      <MemoryRouter>
        <LiveClassMonitor />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /iniciar demo/i }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.uploadAudioChunk).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /detener/i }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.uploadAudioChunk).toHaveBeenCalledTimes(1);
    expect(mocks.getTranscriptionStatus).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "session-1",
      expectedChunks: 1,
    }));
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
    expect(screen.queryByText("Audio procesado")).not.toBeInTheDocument();
    expect(screen.queryByText("Sesión procesada")).not.toBeInTheDocument();
    expect(screen.getAllByText("Listo para grabar")).not.toHaveLength(0);
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
    expect(mocks.finalizeBackendSession).toHaveBeenCalledWith({ sessionId: "session-1" });
  });

  it("keeps manual generation attached to the completed session if finalization fails", async () => {
    installFakeBrowserRecorder();
    mocks.listCandidates
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([mocks.candidate]);
    mocks.finalizeBackendSession.mockRejectedValueOnce(new Error("lesson state is not ready"));
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
    expect(mocks.requestActivityCandidates).toHaveBeenCalledWith({ sessionId: "session-1" });
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
      .toBeLessThan(mocks.finalizeBackendSession.mock.invocationCallOrder[0]);
    expect(stopTrack).toHaveBeenCalled();
  });

  it("keeps recording restart disabled until the previous session close settles", async () => {
    installFakeBrowserRecorder();
    let resolveClose!: (value: { sessionId: string; finalizationEnqueued: boolean }) => void;
    mocks.finalizeBackendSession.mockImplementationOnce(() => new Promise((resolve) => {
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
      resolveClose({ sessionId: "session-1", finalizationEnqueued: true });
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
