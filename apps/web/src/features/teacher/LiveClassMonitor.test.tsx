import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    recordingSource: "microphone" as "microphone" | "prerecorded",
    uploadAudioChunk: vi.fn(async () => ({ audioChunkId: "uploaded-chunk" })),
    getTranscriptionStatus: vi.fn(async () => ({
      expectedChunks: 2,
      uploaded: 2,
      pending: 0,
      transcribing: 0,
      transcribed: 2,
      terminalFailed: 0,
      lessonStateThroughChunkIndex: 1 as number | null,
      complete: true,
    })),
    decodePrerecordedAudio: vi.fn(async () => [
      { audio: new Blob(["one"], { type: "audio/wav" }), chunkIndex: 0, startMs: 0, endMs: 15_000 },
      { audio: new Blob(["two"], { type: "audio/wav" }), chunkIndex: 1, startMs: 15_000, endMs: 22_000 },
    ]),
    supabaseFrom: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    })),
  };
});

vi.mock("../../lib/supabase", () => ({ supabase: { from: mocks.supabaseFrom } }));

vi.mock("../../lib/audioApi", () => ({
  createBackendSession: mocks.createBackendSession,
  getPrerecordedAudioPath: () => "/local-audio/classroom.mp3",
  getRecordingSource: () => mocks.recordingSource,
  getTranscriptionStatus: mocks.getTranscriptionStatus,
  isAudioApiConfigured: () => true,
  requestActivityCandidates: mocks.requestActivityCandidates,
  resolveBackendClassId: (classId: string) => classId,
  submitManualLessonState: vi.fn(),
  uploadAudioChunk: mocks.uploadAudioChunk,
}));

vi.mock("../../lib/prerecordedAudio", () => ({
  decodePrerecordedAudio: mocks.decodePrerecordedAudio,
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

    fireEvent.click(screen.getByRole("button", { name: /iniciar grabación/i }));
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
    expect(mocks.getTranscriptionStatus).toHaveBeenCalledWith({
      sessionId: "session-1",
      expectedChunks: 2,
    });
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

    fireEvent.click(screen.getByRole("button", { name: /iniciar grabación/i }));
    await waitFor(() => expect(mocks.uploadAudioChunk).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /iniciar grabación/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /iniciar grabación/i }));

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
      fireEvent.click(screen.getByRole("button", { name: /iniciar grabación/i }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(await screen.findByText(/no se pudieron transcribir/i)).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: /iniciar grabación/i }));
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
    expect(mocks.getTranscriptionStatus).toHaveBeenCalledWith({
      sessionId: "session-1",
      expectedChunks: 1,
    });
  });

});
