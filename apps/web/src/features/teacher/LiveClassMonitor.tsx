import { useMemo, useState, useEffect, useRef, type FormEvent } from "react";
import {
  StopCircle,
  Sparkles,
  AlertTriangle,
  Leaf,
  Circle,
} from "lucide-react";
import type { DifficultyBand } from "@kobi/activities/contracts";
import { Sidebar } from "./components/Sidebar";
import { useClassStore, type SavedSession, type ClassItem } from "../../lib/store";
import { supabase } from "../../lib/supabase";
import {
  publishAssignments,
  SupabaseActivityDeliveryStore,
  type DeliveryCandidate,
  type StudentForAssignment,
} from "../activityDelivery/artifactDelivery";
import {
  createBackendSession,
  getPrerecordedAudioPath,
  getRecordingSource,
  getTranscriptionStatus,
  isAudioApiConfigured,
  requestActivityCandidates,
  resolveBackendClassId,
  submitManualLessonState,
  uploadAudioChunk,
} from "../../lib/audioApi";
import { decodePrerecordedAudio } from "../../lib/prerecordedAudio";

const AUDIO_CHUNK_MS = 15_000;
const PRERECORDED_UPLOAD_INTERVAL_MS = 2_100;
const TRANSCRIPTION_STATUS_POLL_MS = 2_000;
const TRANSCRIPTION_STATUS_TIMEOUT_MS = 20 * 60_000;

interface LessonStateSnapshot {
  topic: string;
  objective_guess: string | null;
  key_terms: string[];
  transcript_summary: string;
  confidence: number;
  evidence: {
    quoted_phrases: string[];
    reason: string;
  };
}

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
function buildSession(
  cls: ClassItem,
  durationSeconds: number,
  lessonState: LessonStateSnapshot | null,
): SavedSession {
  const meta = SUBJECT_META[cls.icon] ?? SUBJECT_META.pen;
  const summaryPoints = lessonState
    ? [
        lessonState.transcript_summary,
        lessonState.objective_guess ? `Objetivo: ${lessonState.objective_guess}` : "",
        lessonState.key_terms.length > 0 ? `Conceptos clave: ${lessonState.key_terms.join(", ")}.` : "",
      ].filter((point): point is string => Boolean(point))
    : [];
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
    nextSteps: [],
    transcript: [],
  };
}

function formatTime(seconds: number) {
  const m = Math.floor(Math.abs(seconds) / 60)
    .toString()
    .padStart(2, "0");
  const s = (Math.abs(seconds) % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// -- Sub-componentes ---------------------------------------------------------

function TranscriptPlayerCard({
  elapsed,
  isRecording,
  onToggleRecording,
  uploadStatus,
  recordingError,
  uploadedChunkCount,
}: {
  elapsed: number;
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
      {/* Recording status */}
      <div className="flex items-center justify-between px-6 pt-5 pb-3 shrink-0">
        <span className="text-[10px] font-bold tracking-widest uppercase text-slate-400">
          Grabación de clase
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

      {/* Honest recording state; transcript text is not exposed by the current contract. */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-6 flex flex-col gap-4">
        {isRecording ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 py-10">
            <span className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center">
              <Circle className="h-5 w-5 text-emerald-500 fill-emerald-500 animate-pulse" />
            </span>
            <div>
              <p className="text-sm font-bold text-slate-700">Grabando audio...</p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">Los fragmentos se envían al análisis de la sesión.</p>
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
                Inicia la grabación para comenzar el análisis de la sesión.
              </p>
            </div>
          </div>
        )}
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
          <button
            onClick={onToggleRecording}
            className="bg-red-600 hover:bg-red-700 text-white rounded-xl px-5 py-2.5 flex items-center gap-3 font-bold text-sm transition-all hover:shadow-lg active:scale-95"
            type="button"
          >
            <StopCircle className="h-5 w-5" />
            DETENER
          </button>
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

function InsightsPanel({ lessonState }: { lessonState: LessonStateSnapshot | null }) {
  if (!lessonState) {
    return (
      <div className="bg-white rounded-[28px] p-6 border border-slate-200 shadow-sm h-full flex items-center justify-center">
        <div className="max-w-sm text-center">
          <Sparkles className="mx-auto h-8 w-8 text-slate-300" />
          <h2 className="mt-3 text-base font-bold text-slate-700">Esperando análisis de la sesión</h2>
          <p className="mt-2 text-sm text-slate-400">
            El tema, objetivo y evidencia aparecerán cuando el worker guarde un lesson_state.
          </p>
        </div>
      </div>
    );
  }

  const keywords = lessonState.key_terms;

  return (
    <div className="bg-white rounded-[28px] p-6 border border-slate-200 shadow-sm h-full flex flex-col gap-6 overflow-y-auto">
      {/* Tema detectado */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-bold tracking-widest uppercase text-slate-400">
          Tema detectado
        </label>
        <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full border-2 border-emerald-600 text-emerald-700 bg-emerald-50 font-bold text-base w-fit">
          <Leaf className="h-4 w-4" />
          {lessonState.topic}
        </span>
      </div>

      {/* Objetivo actual */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-bold tracking-widest uppercase text-slate-400">
          Objetivo actual
        </label>
        <div className="bg-slate-50 rounded-2xl p-4 border border-violet-400">
          <p className="text-sm text-slate-700 italic font-medium">
            {lessonState.objective_guess ?? "Sin objetivo identificado"}
          </p>
        </div>
      </div>

      {/* Palabras clave */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-bold tracking-widest uppercase text-slate-400">
          Palabras clave detectadas
        </label>
        <div className="flex flex-wrap gap-2">
          {keywords.map((kw) => (
            <span
              key={kw}
              className={`px-3 py-1 rounded-lg text-xs font-bold border transition-colors ${
                kw === keywords[0]
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
        {lessonState.evidence.reason ? (
          <div className="bg-red-50 rounded-2xl p-4 border border-red-100 flex gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
            <div className="flex flex-col gap-1">
              <h4 className="font-bold text-red-800 text-sm">Evidencia del analisis</h4>
              <p className="text-red-700 text-xs leading-relaxed opacity-80">
                {lessonState.evidence.reason}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">No hay evidencia adicional registrada.</p>
        )}
      </div>
    </div>
  );
}

function SuggestedActivityFAB({
  loading,
  onGenerate,
}: {
  loading: boolean;
  onGenerate: () => void;
}) {
  return (
    <div className="fixed bottom-6 right-6 z-50">
      <button
        className="bg-violet-600 text-white px-5 py-3 rounded-full shadow-2xl flex items-center gap-2 hover:scale-105 transition-all active:scale-95 font-bold text-sm disabled:cursor-not-allowed disabled:opacity-70"
        disabled={loading}
        onClick={onGenerate}
        type="button"
      >
        <Sparkles className="h-4 w-4" />
        {loading ? "Generando actividad..." : "Hora de actividad"}
      </button>
    </div>
  );
}

const bandLabels: Record<DifficultyBand, string> = {
  support: "Apoyo",
  core: "Base",
  challenge: "Reto",
};

const bandAccent: Record<
  DifficultyBand,
  { text: string; bg: string; border: string; solid: string; ring: string }
> = {
  support: {
    text: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-300",
    solid: "bg-blue-600",
    ring: "ring-blue-200",
  },
  core: {
    text: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-300",
    solid: "bg-emerald-600",
    ring: "ring-emerald-200",
  },
  challenge: {
    text: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-300",
    solid: "bg-amber-600",
    ring: "ring-amber-200",
  },
};

const bandOptions: DifficultyBand[] = ["support", "core", "challenge"];

/** Which band a student is currently assigned to; anyone not overridden stays on Base. */
function resolveStudentBand(
  studentId: string,
  overridesByBand: Partial<Record<DifficultyBand, string[]>>,
): DifficultyBand {
  if (overridesByBand.support?.includes(studentId)) return "support";
  if (overridesByBand.challenge?.includes(studentId)) return "challenge";
  return "core";
}

function CandidateCard({
  candidate,
  isSelected,
  assignedCount,
  onSelect,
}: {
  candidate: DeliveryCandidate;
  isSelected: boolean;
  assignedCount: number | null;
  onSelect: () => void;
}) {
  const accent = bandAccent[candidate.difficultyBand];

  return (
    <article
      className={`rounded-2xl border p-4 transition ${
        isSelected ? `${accent.border} ${accent.bg}` : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${accent.bg} ${accent.text}`}>
          {bandLabels[candidate.difficultyBand]}
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">
          {assignedCount === null
            ? "Predeterminada"
            : `${assignedCount} estudiante${assignedCount === 1 ? "" : "s"}`}
        </span>
      </div>
      <h3 className="text-base font-bold text-slate-900">{candidate.manifest.title}</h3>
      <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-600">
        {candidate.manifest.content.items[0]?.prompt}
      </p>
      <dl className="mt-3 grid gap-2 text-xs text-slate-500">
        <div>
          <dt className="font-bold uppercase tracking-wide text-slate-400">Objetivo</dt>
          <dd>{candidate.manifest.curriculum.objective}</dd>
        </div>
        <div>
          <dt className="font-bold uppercase tracking-wide text-slate-400">Evidencia</dt>
          <dd className="line-clamp-1">
            {candidate.evidence[0]?.section}: {candidate.evidence[0]?.text}
          </dd>
        </div>
        <div>
          <dt className="font-bold uppercase tracking-wide text-slate-400">Verificador</dt>
          <dd>
            {candidate.verifierScores.deterministic} · alineacion{" "}
            {Math.round(candidate.verifierScores.rubric.curriculum_alignment * 100)}%
          </dd>
        </div>
      </dl>
      <button
        className={`mt-4 w-full rounded-xl border px-3 py-2 text-sm font-bold transition ${
          isSelected
            ? `${accent.border} ${accent.text} bg-white`
            : "border-violet-200 text-violet-700 hover:bg-violet-50"
        }`}
        onClick={onSelect}
        type="button"
      >
        {isSelected ? "Previsualizando" : "Previsualizar"}
      </button>
    </article>
  );
}

function StudentBandRow({
  student,
  band,
  onChange,
}: {
  student: StudentForAssignment;
  band: DifficultyBand;
  onChange: (band: DifficultyBand) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl px-2.5 py-2 transition hover:bg-slate-50">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
          {student.displayName.slice(0, 1).toUpperCase()}
        </span>
        <span className="truncate text-sm font-semibold text-slate-700">{student.displayName}</span>
      </div>
      <div className="flex shrink-0 gap-1 rounded-full bg-slate-100 p-1">
        {bandOptions.map((option) => {
          const isActive = band === option;
          const accent = bandAccent[option];
          return (
            <button
              className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                isActive ? `${accent.solid} text-white shadow-sm` : "text-slate-500 hover:text-slate-700"
              }`}
              key={option}
              onClick={() => onChange(option)}
              type="button"
            >
              {bandLabels[option]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ActivityCandidatePanel({
  candidates,
  selectedCandidate,
  students,
  overridesByBand,
  publishStatus,
  onSelectCandidate,
  onAssignStudentBand,
  onPublish,
}: {
  candidates: DeliveryCandidate[];
  selectedCandidate: DeliveryCandidate | null;
  students: StudentForAssignment[];
  overridesByBand: Partial<Record<DifficultyBand, string[]>>;
  publishStatus: string | null;
  onSelectCandidate: (candidate: DeliveryCandidate) => void;
  onAssignStudentBand: (studentId: string, band: DifficultyBand) => void;
  onPublish: () => void;
}) {
  if (candidates.length === 0) return null;

  const supportIds = overridesByBand.support ?? [];
  const challengeIds = overridesByBand.challenge ?? [];
  const coreCount = Math.max(students.length - supportIds.length - challengeIds.length, 0);
  const assignedCountByBand: Record<DifficultyBand, number | null> = {
    support: supportIds.length,
    core: null,
    challenge: challengeIds.length,
  };

  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-violet-500">
            Candidatos verificados
          </p>
          <h2 className="text-xl font-bold text-slate-900">Aprobar y entregar actividad</h2>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Elige quién necesita Apoyo o un Reto extra. El resto de la clase recibe la actividad Base por defecto.
          </p>
        </div>
        <button
          className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={students.length === 0}
          onClick={onPublish}
          type="button"
        >
          Publicar a estudiantes
        </button>
      </div>

      {students.length > 0 ? (
        <div className="mb-5 flex flex-wrap gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${bandAccent.support.bg} ${bandAccent.support.text}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${bandAccent.support.solid}`} />
            {supportIds.length} con Apoyo
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${bandAccent.core.bg} ${bandAccent.core.text}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${bandAccent.core.solid}`} />
            {coreCount} con Base (predeterminado)
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${bandAccent.challenge.bg} ${bandAccent.challenge.text}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${bandAccent.challenge.solid}`} />
            {challengeIds.length} con Reto
          </span>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        {candidates.map((candidate) => (
          <CandidateCard
            assignedCount={assignedCountByBand[candidate.difficultyBand]}
            candidate={candidate}
            isSelected={selectedCandidate?.id === candidate.id}
            key={candidate.id}
            onSelect={() => onSelectCandidate(candidate)}
          />
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Estudiantes</h3>
            <span className="text-xs font-semibold text-slate-400">{students.length} conectados</span>
          </div>
          {students.length === 0 ? (
            <p className="text-xs text-slate-400">Sin estudiantes conectados.</p>
          ) : (
            <div className="max-h-[560px] space-y-1 overflow-y-auto rounded-xl bg-white p-2">
              {students.map((student) => (
                <StudentBandRow
                  band={resolveStudentBand(student.id, overridesByBand)}
                  key={student.id}
                  onChange={(band) => onAssignStudentBand(student.id, band)}
                  student={student}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
            {selectedCandidate ? (
              <iframe
                className="h-[560px] w-full bg-white"
                sandbox="allow-scripts"
                srcDoc={selectedCandidate.bundleHtml}
                title={`Previsualizacion ${selectedCandidate.manifest.title}`}
              />
            ) : (
              <div className="flex h-[560px] items-center justify-center text-sm text-slate-500">
                Selecciona una actividad para previsualizar.
              </div>
            )}
          </div>
          {publishStatus ? (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{publishStatus}</p>
          ) : null}
        </div>
      </div>
    </section>
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

function normalizeLessonState(value: unknown): LessonStateSnapshot | null {
  if (!value || typeof value !== "object") return null;

  const row = value as Record<string, unknown>;
  const evidence = row.evidence && typeof row.evidence === "object"
    ? row.evidence as Record<string, unknown>
    : {};

  return {
    topic: typeof row.topic === "string" ? row.topic : "Tema detectado",
    objective_guess: typeof row.objective_guess === "string" ? row.objective_guess : null,
    key_terms: Array.isArray(row.key_terms) ? row.key_terms.filter((term): term is string => typeof term === "string") : [],
    transcript_summary: typeof row.transcript_summary === "string" ? row.transcript_summary : "",
    confidence: typeof row.confidence === "number" ? row.confidence : 0,
    evidence: {
      quoted_phrases: Array.isArray(evidence.quoted_phrases)
        ? evidence.quoted_phrases.filter((phrase): phrase is string => typeof phrase === "string")
        : [],
      reason: typeof evidence.reason === "string" ? evidence.reason : "",
    },
  };
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

function abortableDelay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timeoutId = window.setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => {
      window.clearTimeout(timeoutId);
      resolve();
    }, { once: true });
  });
}

// -- Página ------------------------------------------------------------------

export function LiveClassMonitor() {
  const recordingSource = getRecordingSource();
  const [elapsed, setElapsed] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [completedSessionClassId, setCompletedSessionClassId] = useState<string | null>(null);
  const [activitySessionId, setActivitySessionId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<DeliveryCandidate[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentForAssignment[]>([]);
  const [overridesByBand, setOverridesByBand] = useState<Partial<Record<DifficultyBand, string[]>>>({});
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [publishStatus, setPublishStatus] = useState<string | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadedChunkCount, setUploadedChunkCount] = useState(0);
  const [apiSessionId, setApiSessionId] = useState<string | null>(null);
  const [latestLessonState, setLatestLessonState] = useState<LessonStateSnapshot | null>(null);

  const monitoringClassId = useClassStore((state) => state.monitoringClassId);
  const classes = useClassStore((state) => state.classes);
  const endSession = useClassStore((state) => state.endSession);
  const monitoringClass = classes.find((c) => c.id === monitoringClassId) ?? null;
  const activeClass = monitoringClass ?? classes.find((c) => c.id === completedSessionClassId) ?? null;
  const deliveryStore = useMemo(
    () => (supabase ? new SupabaseActivityDeliveryStore(supabase) : null),
    [],
  );
  const selectedCandidate =
    candidates.find((candidate) => candidate.id === selectedCandidateId) ??
    candidates.find((candidate) => candidate.difficultyBand === "core") ??
    candidates[0] ??
    null;
  // Core is always delivered by default; Apoyo/Reto only activate once a student is assigned to them.
  const approvedBands = useMemo<DifficultyBand[]>(() => {
    const bands: DifficultyBand[] = ["core"];
    if ((overridesByBand.support?.length ?? 0) > 0) bands.push("support");
    if ((overridesByBand.challenge?.length ?? 0) > 0) bands.push("challenge");
    return bands;
  }, [overridesByBand]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const apiSessionIdRef = useRef<string | null>(null);
  const chunkIndexRef = useRef(0);
  const recordingStartedAtRef = useRef<number | null>(null);
  const rotationTimerRef = useRef<number | null>(null);
  const isStoppingRef = useRef(false);
  const pendingAudioUploadsRef = useRef<Set<Promise<void>>>(new Set());
  const prerecordedAbortRef = useRef<AbortController | null>(null);
  const prerecordedAcceptedChunksRef = useRef(0);
  const prerecordedDurationSecondsRef = useRef(0);
  const finalizingSessionRef = useRef(false);
  const latestLessonStateRef = useRef<LessonStateSnapshot | null>(null);

  async function refreshLatestLessonState(sessionId: string, shouldApply = () => true) {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("segments")
      .select("lesson_state")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!shouldApply() || error || !data?.lesson_state) return;
    const normalized = normalizeLessonState(data.lesson_state);
    latestLessonStateRef.current = normalized;
    setLatestLessonState(normalized);
  }

  // Timer runs only while recording
  useEffect(() => {
    if (!isRecording || recordingSource !== "microphone") return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [isRecording]);

  useEffect(() => {
    return () => {
      prerecordedAbortRef.current?.abort();
      void stopBrowserRecording();
    };
  }, []);

  useEffect(() => {
    if (!apiSessionId || !supabase) return;

    let cancelled = false;
    const activeSessionId = apiSessionId;
    async function loadLatestSegment() {
      if (cancelled) return;
      await refreshLatestLessonState(activeSessionId, () => !cancelled);
    }

    void loadLatestSegment();
    const intervalId = window.setInterval(loadLatestSegment, 3_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [apiSessionId]);

  async function stopBrowserRecording() {
    isStoppingRef.current = true;

    if (rotationTimerRef.current !== null) {
      window.clearInterval(rotationTimerRef.current);
      rotationTimerRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      logRecorder("stopping recorder", { state: recorder.state });
      const stopped = new Promise<void>((resolve) => {
        recorder.addEventListener("stop", () => resolve(), { once: true });
      });
      recorder.stop();
      await stopped;
    }

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    logRecorder("microphone tracks stopped");
    mediaRecorderRef.current = null;
    mediaStreamRef.current = null;

    await Promise.all(Array.from(pendingAudioUploadsRef.current));
  }

  async function ensureBackendSession() {
    if (apiSessionIdRef.current) return apiSessionIdRef.current;

    if (!isAudioApiConfigured()) {
      throw new Error("Configura VITE_KOBI_API_URL para enviar audio al worker.");
    }

    if (!activeClass) {
      throw new Error("Selecciona una clase antes de iniciar la sesion.");
    }

    const { sessionId } = await createBackendSession({ classId: resolveBackendClassId(activeClass.id) });
    apiSessionIdRef.current = sessionId;
    setApiSessionId(sessionId);
    return sessionId;
  }

  async function processPrerecordedAudio() {
    setElapsed(0);
    setUploadedChunkCount(0);
    setRecordingError(null);
    setLatestLessonState(null);
    latestLessonStateRef.current = null;
    prerecordedAcceptedChunksRef.current = 0;
    prerecordedDurationSecondsRef.current = 0;
    finalizingSessionRef.current = false;

    const abortController = new AbortController();
    prerecordedAbortRef.current = abortController;

    try {
      const sessionId = await ensureBackendSession();
      apiSessionIdRef.current = sessionId;
      setApiSessionId(sessionId);
      isStoppingRef.current = false;
      setUploadStatus("Cargando audio pregrabado");
      setIsRecording(true);

      const response = await fetch(getPrerecordedAudioPath(), { signal: abortController.signal });
      if (!response.ok) {
        throw new Error(`No se pudo cargar el MP3 configurado (${response.status}).`);
      }

      const chunks = await decodePrerecordedAudio(await response.arrayBuffer(), AUDIO_CHUNK_MS);
      if (abortController.signal.aborted) return;

      setUploadStatus(`Audio preparado · ${chunks.length} fragmentos`);
      for (const chunk of chunks) {
        if (abortController.signal.aborted) return;

        setUploadStatus(`Enviando fragmento ${chunk.chunkIndex + 1} de ${chunks.length}`);
        const upload = uploadAudioChunk({
          sessionId,
          audio: chunk.audio,
          chunkIndex: chunk.chunkIndex,
          startMs: chunk.startMs,
          endMs: chunk.endMs,
        }).then((result) => {
          prerecordedAcceptedChunksRef.current += 1;
          prerecordedDurationSecondsRef.current = Math.ceil(chunk.endMs / 1_000);
          setUploadedChunkCount(prerecordedAcceptedChunksRef.current);
          setElapsed(prerecordedDurationSecondsRef.current);
          return result;
        });
        const trackedUpload = upload.then(() => undefined, () => undefined);
        pendingAudioUploadsRef.current.add(trackedUpload);
        try {
          await upload;
        } finally {
          pendingAudioUploadsRef.current.delete(trackedUpload);
        }
        if (chunk.chunkIndex < chunks.length - 1) {
          await abortableDelay(PRERECORDED_UPLOAD_INTERVAL_MS, abortController.signal);
        }
      }

      setUploadStatus("Audio enviado · esperando transcripcion");
      await waitForTranscriptionCompletion(sessionId, chunks.length);
      if (!abortController.signal.aborted) {
        await refreshLatestLessonState(sessionId);
        await finalizeSession(prerecordedDurationSecondsRef.current, true);
      }
    } catch (error) {
      if (abortController.signal.aborted) return;
      setIsRecording(false);
      setRecordingError(error instanceof Error ? error.message : "No se pudo procesar el audio pregrabado.");
      setUploadStatus(null);
    }
  }

  async function waitForTranscriptionCompletion(sessionId: string, expectedChunks: number) {
    const deadline = Date.now() + TRANSCRIPTION_STATUS_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const status = await getTranscriptionStatus({ sessionId, expectedChunks });
      if (status.failed > 0) {
        throw new Error(`${status.failed} fragmento(s) no se pudieron transcribir.`);
      }
      setUploadStatus(
        `Transcribiendo ${status.transcribed} de ${expectedChunks} fragmentos`,
      );
      if (status.complete) return;
      await delay(TRANSCRIPTION_STATUS_POLL_MS);
    }
    throw new Error("La transcripcion no termino dentro del tiempo esperado.");
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
      const upload = handleAudioChunk(event.data);
      pendingAudioUploadsRef.current.add(upload);
      void upload.finally(() => pendingAudioUploadsRef.current.delete(upload));
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
    finalizingSessionRef.current = false;
    if (recordingSource === "prerecorded") {
      await processPrerecordedAudio();
      return;
    }

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
          : "Microfono activo; configura VITE_KOBI_API_URL para transcribir.",
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

  async function finalizeSession(durationSeconds: number, generateActivity: boolean) {
    if (finalizingSessionRef.current) return;
    finalizingSessionRef.current = true;
    setIsRecording(false);
    await stopBrowserRecording();
    setUploadStatus(apiSessionIdRef.current ? "Sesion enviada al worker" : uploadStatus);

    if (activeClass) {
      const session = buildSession(activeClass, durationSeconds, latestLessonStateRef.current);
      setCompletedSessionClassId(activeClass.id);
      endSession(session); // guarda en historial + limpia el monitor activo
      if (generateActivity) void handleGenerateActivity();
    }
  }

  async function stopRecording() {
    if (recordingSource === "prerecorded") {
      prerecordedAbortRef.current?.abort();
      setUploadStatus("Finalizando fragmentos enviados");
      await Promise.all(Array.from(pendingAudioUploadsRef.current));
      const expectedChunks = prerecordedAcceptedChunksRef.current;
      if (expectedChunks > 0 && apiSessionIdRef.current) {
        try {
          await waitForTranscriptionCompletion(apiSessionIdRef.current, expectedChunks);
          await refreshLatestLessonState(apiSessionIdRef.current);
        } catch (error) {
          setIsRecording(false);
          setRecordingError(error instanceof Error ? error.message : "No se pudo finalizar la transcripcion.");
          setUploadStatus(null);
          return;
        }
      }
      await finalizeSession(prerecordedDurationSecondsRef.current, expectedChunks > 0);
      return;
    }

    await finalizeSession(elapsed, true);
  }

  function toggleRecording() {
    if (isRecording) {
      void stopRecording();
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

  async function loadCandidatesForSession(
    sessionId: string,
    options: { allowEmpty: boolean } = { allowEmpty: false },
  ) {
    if (!activeClass || !deliveryStore) {
      if (!options.allowEmpty) {
        setActivityError("Selecciona una clase y configura Supabase para generar la actividad.");
      }
      return false;
    }

    const readyCandidates = await deliveryStore.listCandidates(sessionId);
    if (readyCandidates.length === 0) {
      if (!options.allowEmpty) setActivityError("Todavia no hay actividades listas para esta sesion.");
      return false;
    }

    const loadedStudents = await deliveryStore.listStudents(activeClass.id);
    setActivitySessionId(sessionId);
    setCandidates(readyCandidates);
    setStudents(loadedStudents);
    setSelectedCandidateId(
      readyCandidates.find((candidate) => candidate.difficultyBand === "core")?.id ??
        readyCandidates[0]?.id ??
        null,
    );
    setActivityError(null);
    return true;
  }

  async function handleGenerateActivity() {
    if (!activeClass || !deliveryStore) {
      setActivityError("Selecciona una clase y configura Supabase para generar la actividad.");
      return;
    }

    setActivityLoading(true);
    setActivityError(null);
    setPublishStatus(null);

    try {
      if (apiSessionIdRef.current && await loadCandidatesForSession(apiSessionIdRef.current, { allowEmpty: true })) {
        return;
      }

      const sessionId = apiSessionIdRef.current ?? (await ensureBackendSession());
      await requestActivityCandidates({ sessionId });

      if (!await loadCandidatesForSession(sessionId)) {
        setActivityError("La generacion termino, pero aun no hay actividades listas para esta sesion.");
      }
    } catch (error) {
      setActivityError(error instanceof Error ? error.message : "No se pudo generar la actividad.");
    } finally {
      setActivityLoading(false);
    }
  }

  /** Moves a student to the given band; picking "core" simply clears any override (back to default). */
  function assignStudentBand(studentId: string, band: DifficultyBand) {
    setOverridesByBand((current) => {
      const nextSupport = new Set(current.support ?? []);
      const nextChallenge = new Set(current.challenge ?? []);
      nextSupport.delete(studentId);
      nextChallenge.delete(studentId);

      if (band === "support") nextSupport.add(studentId);
      if (band === "challenge") nextChallenge.add(studentId);

      return {
        support: Array.from(nextSupport),
        challenge: Array.from(nextChallenge),
      };
    });
  }

  async function handlePublish() {
    if (!activeClass || !activitySessionId || !deliveryStore) return;

    setActivityLoading(true);
    setActivityError(null);
    setPublishStatus(null);

    try {
      const published = await publishAssignments({
        store: deliveryStore,
        sessionId: activitySessionId,
        classId: activeClass.id,
        candidates,
        approvedBands,
        overridesByBand,
      });
      setPublishStatus(`Publicado para ${published.length} estudiantes.`);
    } catch (error) {
      setActivityError(error instanceof Error ? error.message : "No se pudo publicar la actividad.");
    } finally {
      setActivityLoading(false);
    }
  }

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
                    {activeClass && (
                      <span className="text-sm text-slate-500">{activeClass.focus}</span>
                    )}
                  </div>
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                    {activeClass ? activeClass.title : "Monitoreo en vivo"}
                  </h1>
                </div>
              </div>

              <div className="grid grid-cols-12 gap-5 flex-1 min-h-0">
                <div className="col-span-7 flex flex-col min-h-0">
                  <TranscriptPlayerCard
                    elapsed={elapsed}
                    isRecording={isRecording}
                    onToggleRecording={toggleRecording}
                    uploadStatus={uploadStatus}
                    recordingError={recordingError}
                    uploadedChunkCount={uploadedChunkCount}
                  />
                </div>
                <div className="col-span-5 min-h-0">
                  <InsightsPanel lessonState={latestLessonState} />
                </div>
              </div>
              {activityError ? (
                <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                  {activityError}
                </div>
              ) : null}
              {activityLoading && candidates.length === 0 ? (
                <section className="rounded-[24px] border border-violet-100 bg-white p-5 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-violet-500">
                    Preparando prototipos
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-slate-900">Generando actividad...</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Kobi esta buscando candidatos de Apoyo, Base y Reto para esta sesion.
                  </p>
                </section>
              ) : null}
              <ActivityCandidatePanel
                candidates={candidates}
                onAssignStudentBand={assignStudentBand}
                onPublish={handlePublish}
                onSelectCandidate={(candidate) => setSelectedCandidateId(candidate.id)}
                overridesByBand={overridesByBand}
                publishStatus={publishStatus}
                selectedCandidate={selectedCandidate}
                students={students}
              />
              <ManualFallbackForm
                disabled={!isAudioApiConfigured()}
                onSubmit={handleManualLessonState}
              />
            </div>
          </div>
        </div>
      </div>
      <SuggestedActivityFAB
        loading={activityLoading}
        onGenerate={handleGenerateActivity}
      />
    </main>
  );
}
