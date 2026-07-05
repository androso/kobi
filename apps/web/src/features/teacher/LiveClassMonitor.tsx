import { useState, useEffect, useRef, type FormEvent } from "react";
import {
  Pause,
  StopCircle,
  Sparkles,
  AlertTriangle,
  Leaf,
  Circle,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { WaveformVisualizer } from "./components/WaveformVisualizer";
import { KobiMascot } from "./components/KobiMascot";
import { useClassStore, type SavedSession, type ClassItem } from "../../lib/store";
import {
  createBackendSession,
  isAudioApiConfigured,
  resolveBackendClassId,
  submitManualLessonState,
  uploadAudioChunk,
} from "../../lib/audioApi";

const AUDIO_CHUNK_MS = 15_000;

function logRecorder(message: string, details?: Record<string, unknown>) {
  if (!import.meta.env.DEV) return;
  console.info(`[Kobi recorder] ${message}`, details ?? {});
}

// Metadatos de materia según el ícono de la clase
const SUBJECT_META: Record<
  ClassItem["icon"],
  { label: string; subjectColor: string; dotColor: string }
> = {
  leaf: { label: "CIENCIAS", subjectColor: "text-emerald-700 bg-emerald-50 border-emerald-100", dotColor: "bg-emerald-500" },
  sigma: { label: "MATEMÁTICAS", subjectColor: "text-blue-700 bg-blue-50 border-blue-100", dotColor: "bg-blue-500" },
  book: { label: "LENGUA", subjectColor: "text-violet-700 bg-violet-50 border-violet-100", dotColor: "bg-violet-500" },
  pen: { label: "GENERAL", subjectColor: "text-slate-700 bg-slate-50 border-slate-100", dotColor: "bg-slate-500" },
};

// Construye una sesión guardada a partir de la clase monitoreada y los datos en vivo
function buildSession(cls: ClassItem, durationSeconds: number): SavedSession {
  const meta = SUBJECT_META[cls.icon] ?? SUBJECT_META.pen;
  const summaryPoints = [
    `Tema trabajado: ${MOCK_INSIGHTS.detectedTopic}.`,
    `Objetivo de la sesión: ${MOCK_INSIGHTS.currentObjective}`,
    `Conceptos clave abordados: ${MOCK_INSIGHTS.keywords.join(", ")}.`,
  ];
  const nextSteps = [
    ...MOCK_INSIGHTS.misconceptions.map((m) => `Reforzar: ${m.title.toLowerCase()}.`),
    `Asignar la actividad sugerida: ${MOCK_INSIGHTS.suggestedActivity}.`,
  ];
  return {
    id: `session-${Date.now()}`,
    classId: cls.id,
    subject: meta.label,
    subjectColor: meta.subjectColor,
    dotColor: meta.dotColor,
    title: cls.title,
    focus: cls.focus,
    date: new Date().toLocaleDateString("es-ES", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    duration: formatTime(durationSeconds),
    summaryPoints,
    nextSteps,
    transcript: [],
  };
}

// ---------------------------------------------------------------------------
// Datos de sesión simulados — reemplazar con datos en tiempo real del backend
// cuando la transcripción esté implementada.
// ---------------------------------------------------------------------------
const MOCK_INSIGHTS = {
  totalSeconds: 29 * 60 + 41,
  detectedTopic: "Ecosistemas",
  currentObjective: "Analizar el flujo de energía a través de los niveles tróficos.",
  keywords: ["Fotosíntesis", "Descomponedores", "Niveles tróficos", "Pirámide de energía"],
  highlightedKeyword: "Niveles tróficos",
  misconceptions: [
    {
      title: "Confusión entre energía y materia",
      description:
        '3 estudiantes preguntaron si la energía se "recicla" como el agua. Confusión común con la Ley de Conservación de la Materia.',
    },
  ],
  engagementPulse: [40, 65, 85, 70, 95, 60, 45],
  suggestedActivity: "Juego de redes de energía",
};

// ---------------------------------------------------------------------------

function formatTime(seconds: number) {
  const m = Math.floor(Math.abs(seconds) / 60)
    .toString()
    .padStart(2, "0");
  const s = (Math.abs(seconds) % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// -- Sub-componentes ---------------------------------------------------------

function NotificationBar() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 inline-flex items-center gap-2.5 w-fit self-start shrink-0">
      <Sparkles className="h-4 w-4 text-violet-500 animate-bounce" />
      <span className="text-sm text-slate-600">Kobi está trabajando</span>
      <div className="flex gap-1">
        <div className="w-1.5 h-1.5 rounded-full bg-violet-300" />
        <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
        <div className="w-1.5 h-1.5 rounded-full bg-violet-600" />
      </div>
    </div>
  );
}

function TranscriptPlayerCard({
  elapsed,
  remaining,
  isRecording,
  onToggleRecording,
  uploadStatus,
  recordingError,
  uploadedChunkCount,
}: {
  elapsed: number;
  remaining: number;
  isRecording: boolean;
  onToggleRecording: () => void;
  uploadStatus: string | null;
  recordingError: string | null;
  uploadedChunkCount: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [isRecording]);

  return (
    <div className="bg-white rounded-[20px] shadow-sm border border-slate-200 overflow-hidden flex flex-col flex-1 min-h-0">
      {/* Encabezado de transcripción */}
      <div className="flex items-center justify-between px-6 pt-5 pb-3 shrink-0">
        <span className="text-[10px] font-bold tracking-widest uppercase text-slate-400">
          Transcripción en vivo
        </span>
        {isRecording ? (
          <span className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase text-emerald-600">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            En vivo
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase text-slate-400">
            <span className="w-2 h-2 bg-slate-300 rounded-full" />
            Detenido
          </span>
        )}
      </div>

      {/* Cuerpo de la transcripción (desplazable) */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-6 flex flex-col gap-4">
        {isRecording ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 py-10">
            <span className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center">
              <Circle className="h-5 w-5 text-emerald-500 fill-emerald-500 animate-pulse" />
            </span>
            <div>
              <p className="text-sm font-bold text-slate-700">Grabando audio...</p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                La transcripción en vivo estará disponible próximamente.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 py-10">
            <span className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
              <Circle className="h-5 w-5 text-red-500 fill-red-500" />
            </span>
            <div>
              <p className="text-sm font-bold text-slate-700">Listo para grabar</p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                Inicia la grabación para comenzar la transcripción y el análisis en tiempo real.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Visualizador de forma de onda */}
      <div className="h-24 bg-[#f8f7f5] border-y border-slate-200 px-4 shrink-0">
        <WaveformVisualizer active={isRecording} />
      </div>

      {/* Controles de grabación */}
      <div className="bg-slate-50 px-6 py-4 flex items-center justify-between gap-4 shrink-0">
        <span className={`text-sm font-bold tabular-nums ${isRecording ? "text-slate-500" : "text-slate-300"}`}>
          {formatTime(elapsed)}
        </span>

        <div className="min-w-0 flex-1 text-center">
          {recordingError ? (
            <p className="text-xs font-semibold text-red-600 truncate">{recordingError}</p>
          ) : uploadStatus ? (
            <p className="text-xs font-semibold text-slate-500 truncate">
              {uploadStatus}
              {uploadedChunkCount > 0 ? ` · ${uploadedChunkCount} fragmentos enviados` : ""}
            </p>
          ) : null}
        </div>

        {isRecording ? (
          <div className="flex items-center gap-3">
            <button
              className="w-11 h-11 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-all active:scale-90"
              type="button"
            >
              <Pause className="h-5 w-5" />
            </button>
            <button
              onClick={onToggleRecording}
              className="bg-red-600 hover:bg-red-700 text-white rounded-xl px-5 py-2.5 flex items-center gap-3 font-bold text-sm transition-all hover:shadow-lg active:scale-95"
              type="button"
            >
              <StopCircle className="h-5 w-5" />
              <span>
                DETENER{" "}
                <span className="opacity-75 font-normal">{formatTime(remaining)}</span>
              </span>
            </button>
          </div>
        ) : (
          <button
            onClick={onToggleRecording}
            className="bg-red-600 hover:bg-red-700 text-white rounded-xl px-5 py-2.5 flex items-center gap-2.5 font-bold text-sm transition-all hover:shadow-lg active:scale-95"
            type="button"
          >
            <Circle className="h-4 w-4 fill-white" />
            Iniciar grabación
          </button>
        )}
      </div>
    </div>
  );
}

function InsightsPanel() {
  return (
    <div className="bg-white rounded-[28px] p-6 border border-slate-200 shadow-sm h-full flex flex-col gap-6 overflow-y-auto">
      {/* Tema detectado */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-bold tracking-widest uppercase text-slate-400">
          Tema detectado
        </label>
        <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full border-2 border-emerald-600 text-emerald-700 bg-emerald-50 font-bold text-base w-fit">
          <Leaf className="h-4 w-4" />
          {MOCK_INSIGHTS.detectedTopic}
        </span>
      </div>

      {/* Objetivo actual */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-bold tracking-widest uppercase text-slate-400">
          Objetivo actual
        </label>
        <div className="bg-slate-50 rounded-2xl p-4 border border-violet-400">
          <p className="text-sm text-slate-700 italic font-medium">
            "{MOCK_INSIGHTS.currentObjective}"
          </p>
        </div>
      </div>

      {/* Palabras clave */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-bold tracking-widest uppercase text-slate-400">
          Palabras clave detectadas
        </label>
        <div className="flex flex-wrap gap-2">
          {MOCK_INSIGHTS.keywords.map((kw) => (
            <span
              key={kw}
              className={`px-3 py-1 rounded-lg text-xs font-bold border transition-colors ${
                kw === MOCK_INSIGHTS.highlightedKeyword
                  ? "border-[#004ac6] text-[#004ac6] bg-blue-50"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {kw}
            </span>
          ))}
        </div>
      </div>

      {/* Conceptos erróneos */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-bold tracking-widest uppercase text-slate-400">
          Conceptos erróneos detectados
        </label>
        {MOCK_INSIGHTS.misconceptions.map((m) => (
          <div
            key={m.title}
            className="bg-red-50 rounded-2xl p-4 border border-red-100 flex gap-3"
          >
            <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
            <div className="flex flex-col gap-1">
              <h4 className="font-bold text-red-800 text-sm">{m.title}</h4>
              <p className="text-red-700 text-xs leading-relaxed opacity-80">
                {m.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Pulso de participación */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-bold tracking-widest uppercase text-slate-400">
          Pulso de participación
        </label>
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
          <div className="flex justify-between items-end h-20 gap-1.5 px-2">
            {MOCK_INSIGHTS.engagementPulse.map((pct, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-full bg-gradient-to-t from-violet-600 to-violet-400"
                style={{ height: `${pct}%` }}
              />
            ))}
          </div>
          <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase px-2 mt-2">
            <span>T-20m</span>
            <span>T-10m</span>
            <span>AHORA</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SuggestedActivityFAB({ activity }: { activity: string }) {
  return (
    <div className="fixed bottom-6 right-6 z-50">
      <button className="bg-violet-600 text-white px-5 py-3 rounded-full shadow-2xl flex items-center gap-2 hover:scale-105 transition-all active:scale-95 font-bold text-sm" type="button">
        <Sparkles className="h-4 w-4" />
        Actividad sugerida: {activity}
      </button>
    </div>
  );
}

function ManualFallbackForm({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (input: { topic: string; objective?: string }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [objective, setObjective] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit({ topic, objective: objective || undefined });
      setTopic("");
      setObjective("");
      setOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        className="text-sm font-bold text-slate-500 hover:text-slate-800 transition self-start"
        disabled={disabled}
        onClick={() => setOpen(true)}
        type="button"
      >
        No se detecto bien la clase {"->"} Escribir tema manualmente
      </button>
    );
  }

  return (
    <form
      className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col gap-3 max-w-xl"
      onSubmit={handleSubmit}
    >
      <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
        Tema que estas dando
        <input
          className="rounded-xl border border-slate-200 px-3 py-2 font-normal"
          onChange={(event) => setTopic(event.target.value)}
          required
          value={topic}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
        Objetivo
        <input
          className="rounded-xl border border-slate-200 px-3 py-2 font-normal"
          onChange={(event) => setObjective(event.target.value)}
          value={objective}
        />
      </label>
      <div className="flex gap-2">
        <button
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          disabled={disabled || isSubmitting}
          type="submit"
        >
          Guardar tema
        </button>
        <button
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600"
          onClick={() => setOpen(false)}
          type="button"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

// -- Página ------------------------------------------------------------------

export function LiveClassMonitor() {
  const navigate = useNavigate();
  const [elapsed, setElapsed] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [finishedSession, setFinishedSession] = useState<SavedSession | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadedChunkCount, setUploadedChunkCount] = useState(0);

  const monitoringClassId = useClassStore((state) => state.monitoringClassId);
  const classes = useClassStore((state) => state.classes);
  const endSession = useClassStore((state) => state.endSession);
  const monitoringClass = classes.find((c) => c.id === monitoringClassId) ?? null;
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const apiSessionIdRef = useRef<string | null>(null);
  const chunkIndexRef = useRef(0);
  const recordingStartedAtRef = useRef<number | null>(null);
  const rotationTimerRef = useRef<number | null>(null);
  const isStoppingRef = useRef(false);

  // Timer runs only while recording
  useEffect(() => {
    if (!isRecording) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [isRecording]);

  useEffect(() => {
    return () => {
      stopBrowserRecording();
    };
  }, []);

  function stopBrowserRecording() {
    isStoppingRef.current = true;

    if (rotationTimerRef.current !== null) {
      window.clearInterval(rotationTimerRef.current);
      rotationTimerRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      logRecorder("stopping recorder", { state: recorder.state });
      recorder.stop();
    }

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    logRecorder("microphone tracks stopped");
    mediaRecorderRef.current = null;
    mediaStreamRef.current = null;
  }

  async function ensureBackendSession() {
    if (apiSessionIdRef.current) return apiSessionIdRef.current;

    if (!isAudioApiConfigured()) {
      throw new Error("Configura VITE_KOBI_API_URL para enviar audio al worker.");
    }

    if (!monitoringClass) {
      throw new Error("Selecciona una clase antes de iniciar la sesion.");
    }

    const { sessionId } = await createBackendSession({ classId: resolveBackendClassId(monitoringClass.id) });
    apiSessionIdRef.current = sessionId;
    return sessionId;
  }

  async function handleAudioChunk(audio: Blob) {
    const sessionId = apiSessionIdRef.current;
    const startedAt = recordingStartedAtRef.current;
    if (audio.size === 0) return;

    if (!sessionId || !startedAt) {
      logRecorder("chunk emitted without upload", {
        hasSessionId: Boolean(sessionId),
        hasStartedAt: Boolean(startedAt),
        mimeType: audio.type || "application/octet-stream",
        sizeBytes: audio.size,
      });
      return;
    }

    const chunkIndex = chunkIndexRef.current;
    chunkIndexRef.current += 1;

    logRecorder("chunk emitted", {
      sessionId,
      chunkIndex,
      mimeType: audio.type || "application/octet-stream",
      sizeBytes: audio.size,
    });

    setUploadStatus(`Enviando fragmento ${chunkIndex + 1}`);
    try {
      await uploadAudioChunk({
        sessionId,
        audio,
        chunkIndex,
        startMs: chunkIndex * AUDIO_CHUNK_MS,
        endMs: Math.max(Date.now() - startedAt, (chunkIndex + 1) * AUDIO_CHUNK_MS),
      });
      setUploadedChunkCount((count) => count + 1);
      setUploadStatus("Audio enviado al worker");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo enviar el audio.";
      setRecordingError(message);
      setUploadStatus(null);
    }
  }

  // Cada instancia de MediaRecorder produce un unico blob autocontenido al
  // detenerse (sin timeslice). Encadenamos instancias para poder subir
  // fragmentos periodicos que sean decodificables de forma independiente.
  function attachRecorderHandlers(recorder: MediaRecorder) {
    recorder.ondataavailable = (event) => {
      void handleAudioChunk(event.data);
    };
    recorder.onerror = () => {
      setRecordingError("No se pudo grabar el audio del navegador.");
    };
  }

  function startNewRecorderSegment() {
    const stream = mediaStreamRef.current;
    if (!stream || isStoppingRef.current) return;

    const recorder = new MediaRecorder(stream);
    attachRecorderHandlers(recorder);
    mediaRecorderRef.current = recorder;
    recorder.start();
    logRecorder("recorder segment started", { mimeType: recorder.mimeType });
  }

  function rotateRecorderSegment() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    recorder.onstop = () => {
      if (!isStoppingRef.current) {
        startNewRecorderSegment();
      }
    };
    recorder.stop();
  }

  async function startRecording() {
    setElapsed(0);
    setUploadedChunkCount(0);
    setRecordingError(null);

    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        throw new Error("Este navegador no soporta grabacion de audio.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const sessionId = isAudioApiConfigured() ? await ensureBackendSession() : null;

      logRecorder("microphone permission granted", {
        trackCount: stream.getAudioTracks().length,
        apiSessionId: sessionId,
      });

      apiSessionIdRef.current = sessionId;
      chunkIndexRef.current = 0;
      recordingStartedAtRef.current = Date.now();
      isStoppingRef.current = false;

      startNewRecorderSegment();
      rotationTimerRef.current = window.setInterval(rotateRecorderSegment, AUDIO_CHUNK_MS);

      logRecorder("recorder started", {
        segmentMs: AUDIO_CHUNK_MS,
        mimeType: mediaRecorderRef.current?.mimeType,
        uploadsEnabled: Boolean(sessionId),
      });
      setUploadStatus(
        sessionId
          ? "Grabando audio para transcripcion"
          : "Microfono activo en modo demo; configura VITE_KOBI_API_URL para transcribir.",
      );
      setIsRecording(true);
    } catch (error) {
      isStoppingRef.current = true;
      if (rotationTimerRef.current !== null) {
        window.clearInterval(rotationTimerRef.current);
        rotationTimerRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      const message = error instanceof Error ? error.message : "No se pudo iniciar la grabacion.";
      logRecorder("recording start failed", { error: message });
      setRecordingError(message);
      setUploadStatus(null);
    }
  }

  function stopRecording() {
    stopBrowserRecording();
    setIsRecording(false);
    setUploadStatus(apiSessionIdRef.current ? "Sesion enviada al worker" : uploadStatus);

    if (monitoringClass) {
      const session = buildSession(monitoringClass, elapsed);
      endSession(session); // guarda en historial + limpia el monitor activo
      setFinishedSession(session);
    }
  }

  function toggleRecording() {
    if (isRecording) {
      stopRecording();
      return;
    }
    void startRecording();
  }

  async function handleManualLessonState(input: { topic: string; objective?: string }) {
    setRecordingError(null);
    try {
      const sessionId = await ensureBackendSession();
      await submitManualLessonState({ sessionId, ...input });
      setUploadStatus("Tema manual guardado como lesson_state");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo guardar el tema manual.";
      setRecordingError(message);
    }
  }

  const remaining = MOCK_INSIGHTS.totalSeconds - elapsed;

  return (
    <main className="min-h-screen bg-[#eef3fb] overflow-hidden">
      <div className="grid min-h-screen w-full lg:grid-cols-[240px_minmax(0,1fr)] bg-[#eef3fb]">
        <Sidebar />
        <div className="flex flex-col p-3 sm:p-4 lg:p-5 h-screen">
          <div className="flex-1 flex flex-col bg-[#f8f9ff] rounded-[30px] border border-slate-200/50 overflow-hidden shadow-sm min-h-0">
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 min-h-0">
              {/* Session header — clase que se está monitoreando */}
              <div className="flex items-center justify-between flex-wrap gap-3 shrink-0">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {isRecording ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-50 text-red-600 rounded-full text-[10px] font-bold uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                        Grabando
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-500 rounded-full text-[10px] font-bold uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                        Listo para grabar
                      </span>
                    )}
                    {monitoringClass && (
                      <span className="text-sm text-slate-500">{monitoringClass.focus}</span>
                    )}
                  </div>
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                    {monitoringClass ? monitoringClass.title : "Monitoreo en vivo"}
                  </h1>
                </div>
              </div>

              <NotificationBar />
              <div className="grid grid-cols-12 gap-5 flex-1 min-h-0">
                <div className="col-span-7 flex flex-col min-h-0">
                  <TranscriptPlayerCard
                    elapsed={elapsed}
                    remaining={remaining}
                    isRecording={isRecording}
                    onToggleRecording={toggleRecording}
                    uploadStatus={uploadStatus}
                    recordingError={recordingError}
                    uploadedChunkCount={uploadedChunkCount}
                  />
                </div>
                <div className="col-span-5 min-h-0">
                  <InsightsPanel />
                </div>
              </div>
              <ManualFallbackForm
                disabled={!isAudioApiConfigured()}
                onSubmit={handleManualLessonState}
              />
            </div>
          </div>
        </div>
      </div>
      <SuggestedActivityFAB activity={MOCK_INSIGHTS.suggestedActivity} />

      {/* Resumen de fin de sesión */}
      {finishedSession && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
          <div className="relative w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-200 max-h-[88vh] flex flex-col bg-gradient-to-br from-violet-100 via-rose-50 to-white">

            {/* Hero — estilo tarjeta suave con número marca de agua */}
            <div className="relative px-7 pt-7 pb-6">
              {/* Kobi asomándose en la esquina */}
              <KobiMascot className="pointer-events-none absolute top-4 right-5 h-16 w-16 text-slate-900 -rotate-6 select-none" />

              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                  Sesión finalizada
                </span>
              </div>

              <p className="text-sm text-slate-500 leading-relaxed max-w-[72%]">
                Tu sesión de <span className="font-bold text-slate-700">{finishedSession.title}</span> quedó guardada con su resumen y transcripción.
              </p>

              {/* Métrica hero — duración con decimales atenuados */}
              <div className="mt-6 flex items-end justify-between">
                <div className="flex items-baseline">
                  <span className="text-5xl font-bold text-slate-900 tabular-nums">
                    {finishedSession.duration.split(":")[0]}
                  </span>
                  <span className="text-5xl font-bold text-slate-400 tabular-nums">
                    :{finishedSession.duration.split(":")[1]}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setFinishedSession(null);
                    navigate("/teacher/repositories");
                  }}
                  className="group flex items-center gap-3 text-sm font-medium text-slate-600"
                  type="button"
                >
                  <span className="text-right leading-tight">
                    Duración
                    <br />
                    de la sesión
                  </span>
                  <span className="w-8 h-px bg-slate-300 group-hover:w-10 transition-all" />
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </button>
              </div>

              {/* Botón principal tipo píldora oscura */}
              <button
                onClick={() => {
                  setFinishedSession(null);
                  navigate("/teacher/repositories");
                }}
                className="mt-6 w-full py-3.5 rounded-full bg-slate-900 text-white font-bold text-sm hover:bg-slate-800 transition-all active:scale-[0.98]"
                type="button"
              >
                Ver en Clases anteriores
              </button>
            </div>

            {/* Detalle — resumen y próximos pasos */}
            <div className="bg-white/70 backdrop-blur-sm px-7 py-6 overflow-y-auto flex flex-col gap-5">
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Resumen</h4>
                <ul className="space-y-2">
                  {finishedSession.summaryPoints.map((p, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-slate-600 leading-relaxed">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-2 shrink-0" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Próximos pasos</h4>
                <ul className="space-y-2">
                  {finishedSession.nextSteps.map((s, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-slate-600 leading-relaxed">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-2 shrink-0" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                onClick={() => {
                  setFinishedSession(null);
                  navigate("/teacher");
                }}
                className="self-start text-sm font-bold text-slate-500 hover:text-slate-800 transition"
                type="button"
              >
                Volver al panel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
