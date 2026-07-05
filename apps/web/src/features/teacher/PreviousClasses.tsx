import { useState } from "react";
import {
  FolderOpen,
  Calendar,
  Clock,
  Filter,
  Search,
  X,
  Mic,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Sparkles,
  ChevronRight
} from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { CreateClassModal } from "./components/CreateClassModal";
import { useClassStore, useAuthStore, type SavedSession } from "../../lib/store";
import { supabase } from "../../lib/supabase";

// ---------------------------------------------------------------------------
// Seed history (structured for the combined summary & transcript layout).
// Live sessions saved from the monitor are prepended from the store.
// ---------------------------------------------------------------------------
const PREVIOUS_SESSIONS: SavedSession[] = [
  {
    id: "seed-1",
    classId: "",
    subject: "CIENCIAS",
    subjectColor: "text-emerald-700 bg-emerald-50 border-emerald-100",
    dotColor: "bg-emerald-500",
    title: "Ciencias 4to Grado - Sección A",
    focus: "Ecosistemas y energía",
    date: "15 de junio, 2024",
    duration: "45:00",
    summaryPoints: [
      "Se discutieron los niveles tróficos y la pirámide de energía en el ecosistema.",
      "Los estudiantes mostraron gran interés al hablar sobre los descomponedores y el ciclo de la energía.",
      "Identificamos un malentendido común sobre si la energía se recicla de la misma forma que la materia."
    ],
    nextSteps: [
      "Repasar la diferencia entre la conservación de la materia y el flujo de energía.",
      "Asignar la actividad interactiva 'Cadena alimenticia' para la próxima semana."
    ],
    transcript: [
      { time: "0:01", speaker: "Sra. Henderson", text: "Buenos días clase, hoy exploraremos cómo fluye la energía a través de un ecosistema." },
      { time: "0:05", speaker: "Carlos M.", text: "¿La energía se recicla como el agua y la materia?" },
      { time: "0:09", speaker: "Sra. Henderson", text: "Excelente pregunta, Carlos. En realidad, la energía fluye de forma unidireccional y se disipa en forma de calor, no se recicla." },
      { time: "0:13", speaker: "María J.", text: "Entonces, ¿los productores siempre obtienen su energía del sol directamente?" },
      { time: "0:18", speaker: "Sra. Henderson", text: "Exacto, María. A través del proceso de la fotosíntesis." },
      { time: "0:25", speaker: "Carlos M.", text: "¡Ah, entiendo! Por eso la base de la pirámide alimenticia siempre tiene que ser más grande." },
      { time: "0:29", speaker: "Sra. Henderson", text: "¡Brillante observación, Carlos! De eso se trata la transferencia trófica." }
    ]
  },
  {
    id: "seed-2",
    classId: "",
    subject: "MATEMÁTICAS",
    subjectColor: "text-blue-700 bg-blue-50 border-blue-100",
    dotColor: "bg-blue-500",
    title: "Matemáticas 5to Grado - Sección B",
    focus: "Ecuaciones lineales",
    date: "14 de junio, 2024",
    duration: "60:00",
    summaryPoints: [
      "Clase dedicada a resolver ecuaciones lineales simples.",
      "Practicamos el despeje de variables y el orden de operaciones (PEMDAS).",
      "La mayoría de los estudiantes resolvió con éxito los ejercicios prácticos individuales."
    ],
    nextSteps: [
      "Iniciar con ecuaciones lineales que contengan variables en ambos lados.",
      "Habilitar práctica de álgebra en el portal del estudiante."
    ],
    transcript: [
      { time: "0:01", speaker: "Sra. Henderson", text: "Hoy resolveremos ecuaciones lineales básicas. Recuerden aislar la variable en un lado de la igualdad." },
      { time: "0:05", speaker: "Sofía T.", text: "Si sumamos de un lado, ¿tenemos que sumar exactamente lo mismo del otro?" },
      { time: "0:09", speaker: "Sra. Henderson", text: "Es correcto, Sofía. Una ecuación funciona como una balanza en perfecto equilibrio." }
    ]
  },
  {
    id: "seed-3",
    classId: "",
    subject: "HISTORIA",
    subjectColor: "text-amber-700 bg-amber-50 border-amber-100",
    dotColor: "bg-amber-500",
    title: "Historia 4to Grado - Sección A",
    focus: "Culturas Prehispánicas",
    date: "12 de junio, 2024",
    duration: "50:00",
    summaryPoints: [
      "Taller sobre los asentamientos antiguos y la agricultura prehispánica en Centroamérica.",
      "Los alumnos trabajaron en grupos pequeños investigando el sistema de cultivo por terrazas."
    ],
    nextSteps: [
      "Realizar una breve exposición sobre la influencia del maíz en la dieta prehispánica.",
      "Asignar lectura complementaria sobre la civilización maya."
    ],
    transcript: [
      { time: "0:01", speaker: "Sra. Henderson", text: "Hoy nos enfocaremos en las técnicas agrícolas utilizadas por las civilizaciones antiguas." },
      { time: "0:05", speaker: "Mateo R.", text: "¿El maíz era el único cultivo principal?" },
      { time: "0:09", speaker: "Sra. Henderson", text: "Principalmente sí, Mateo, pero también cultivaban frijol, calabaza y cacao." }
    ]
  }
];

function formatTimeMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const JUNK_TRANSCRIPTS = [
  "subtítulos realizados por",
  "amara.org",
  "subtitles by",
  "thank you for watching",
  "subs by",
  "subtitulado por",
];

export function PreviousClasses() {
  const user = useAuthStore((state) => state.user);
  const teacherName = user?.displayName || user?.email?.split("@")[0] || "Docente";
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSession, setSelectedSession] = useState<SavedSession | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [playProgress, setPlayProgress] = useState(30);
  const [playbackRate, setPlaybackRate] = useState(1);

  // Sessions saved live from the monitor appear first, then the seed history (only for mock teacher)
  const storeSessions = useClassStore((state) => state.sessions);
  const teacherId = user?.id;
  const currentTeacherSessions = storeSessions.filter(
    (s) => !s.teacherId || s.teacherId === teacherId
  );
  const isMockTeacher = user?.email === "maestra@kobi.test";
  const allSessions = isMockTeacher
    ? [...currentTeacherSessions, ...PREVIOUS_SESSIONS]
    : currentTeacherSessions;

  // Calculate dynamic stats
  const totalSessionsCount = allSessions.length;
  const totalMinutes = allSessions.reduce((sum, s) => {
    const parts = s.duration.split(":");
    const mins = parseInt(parts[0], 10) || 0;
    return sum + mins;
  }, 0);
  const totalHours = Math.round((totalMinutes / 60) * 10) / 10;
  const averageParticipation = totalSessionsCount > 0 ? "82%" : "0%";

  const PLAYBACK_RATES = [1, 1.25, 1.5, 2, 0.5];
  function cyclePlaybackRate() {
    setPlaybackRate((rate) => {
      const idx = PLAYBACK_RATES.indexOf(rate);
      return PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length];
    });
  }

  const filteredSessions = allSessions.filter(
    (session) =>
      session.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.focus.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  async function handleOpenDetailsModal(session: SavedSession) {
    setSelectedSession(session);
    setIsPlaying(false);
    setPlayProgress(15);

    const isMock = session.id.startsWith("seed-");
    if (!isMock && supabase) {
      try {
        const { data: chunks, error } = await supabase
          .from("audio_chunks")
          .select("transcript_text, start_ms, chunk_index")
          .eq("session_id", session.id)
          .order("chunk_index", { ascending: true });

        if (!error && chunks) {
          const lines = chunks
            .filter((c) => {
              if (!c.transcript_text || c.transcript_text.trim().length === 0) return false;
              const normalized = c.transcript_text.toLowerCase();
              return !JUNK_TRANSCRIPTS.some((junk) => normalized.includes(junk));
            })
            .map((c) => ({
              time: formatTimeMs(c.start_ms),
              speaker: "Docente",
              text: c.transcript_text,
            }));

          setSelectedSession((curr) => curr && curr.id === session.id ? {
            ...curr,
            transcript: lines,
          } : curr);
        }
      } catch (err) {
        console.error("Error loading transcript from Supabase:", err);
      }
    }
  }

  function handleCloseModal() {
    setSelectedSession(null);
  }

  return (
    <main className="min-h-screen bg-[#eef3fb] overflow-hidden">
      <div className="grid min-h-screen w-full lg:grid-cols-[240px_minmax(0,1fr)] bg-[#eef3fb]">
        
        {/* Left Sidebar */}
        <Sidebar onOpenCreateClass={() => setIsCreateModalOpen(true)} />
        
        {/* Main Content Area */}
        <div className="flex flex-col p-3 sm:p-4 lg:p-5 h-screen">
          <div className="flex-1 flex flex-col bg-[#f8f9ff] rounded-[30px] border border-slate-200/50 overflow-hidden shadow-sm min-h-0">

            {/* Dashboard Content split (Main list on left, stats sidebar on right) */}
            <div className="flex-grow flex min-h-0 overflow-hidden">
              
              {/* Left Column: Sessions List */}
              <div className="flex-1 overflow-y-auto p-6 lg:p-8 custom-scrollbar">
                <div className="max-w-3xl mx-auto">
                  <header className="flex justify-between items-end mb-6">
                    <div>
                      <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Historial de Sesiones</h2>
                      <p className="text-sm text-slate-500 mt-1">Revisa y administra los resúmenes y transcripciones de tus clases anteriores.</p>
                    </div>
                    <button className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
                      <Filter className="h-3.5 w-3.5 text-slate-500" />
                      <span>Filtrar por Fecha</span>
                    </button>
                  </header>

                  {/* Sessions grid */}
                  <div className="space-y-4">
                    {filteredSessions.length > 0 ? (
                      filteredSessions.map((session) => (
                        <div 
                          key={session.id} 
                          className="bg-white p-5 rounded-3xl border border-slate-100 hover:border-[#004ac6]/20 hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
                        >
                          <div className="flex items-center gap-5">
                            <div className={`w-3 h-3 rounded-full ${session.dotColor} shrink-0 ml-1.5 mr-1`} />
                            <div>
                              <span className={`inline-block text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${session.subjectColor} mb-1.5`}>
                                {session.subject}
                              </span>
                              <h4 className="text-base font-bold text-slate-800 leading-tight">{session.title}</h4>
                              <p className="text-xs text-slate-400 mt-0.5 font-medium">{session.focus}</p>
                              
                              <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-500 font-medium">
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3.5 w-3.5 text-slate-400" /> 
                                  {session.date}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3.5 w-3.5 text-slate-400" /> 
                                  {session.duration}
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="self-end sm:self-center">
                            <button 
                              onClick={() => handleOpenDetailsModal(session)}
                              className="px-5 py-2.5 rounded-xl bg-[#004ac6] hover:bg-[#003ea8] text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1"
                            >
                              <span>Ver detalles</span>
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 p-8">
                        <FolderOpen className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-sm font-bold text-slate-600">No se encontraron sesiones anteriores</p>
                        <p className="text-xs text-slate-400 mt-1">Prueba a buscar con otros términos.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Period Summary Sidebar */}
              <div className="w-[300px] border-l border-slate-100 bg-white p-6 shrink-0 hidden xl:flex flex-col gap-6 overflow-y-auto custom-scrollbar">

                {/* Period Summary — soft pastel cards */}
                <div className="space-y-4">
                  <span className="text-xs font-bold text-slate-400 tracking-wider uppercase">Resumen del período</span>

                  <div className="space-y-3">
                    <div className="rounded-3xl p-5 bg-violet-100/70 hover:bg-violet-100 transition-colors">
                      <p className="text-lg font-extrabold text-slate-800 leading-tight">
                        {totalSessionsCount} {totalSessionsCount === 1 ? "clase" : "clases"}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 font-medium">Total de sesiones</p>
                    </div>

                    <div className="rounded-3xl p-5 bg-teal-100/60 hover:bg-teal-100/80 transition-colors">
                      <p className="text-lg font-extrabold text-slate-800 leading-tight">{totalHours} h</p>
                      <p className="text-xs text-slate-500 mt-0.5 font-medium">Horas grabadas</p>
                    </div>

                    <div className="rounded-3xl p-5 bg-blue-100/60 hover:bg-blue-100/80 transition-colors">
                      <p className="text-lg font-extrabold text-slate-800 leading-tight">{averageParticipation}</p>
                      <p className="text-xs text-slate-500 mt-0.5 font-medium">Participación promedio</p>
                    </div>
                  </div>
                </div>

                {/* Current Focus — pastel card */}
                {allSessions.length > 0 ? (
                  <div className="space-y-4">
                    <span className="text-xs font-bold text-slate-400 tracking-wider uppercase">Enfoque actual</span>
                    <div className="rounded-3xl p-5 bg-indigo-100/50">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-bold text-sm text-slate-800">{allSessions[0].title}</h4>
                        <span className="text-xs font-extrabold text-indigo-600">64%</span>
                      </div>
                      <div className="w-full bg-white/70 h-2 rounded-full overflow-hidden">
                        <div className="bg-indigo-500 h-full w-[64%] rounded-full"></div>
                      </div>
                      <p className="text-xs text-slate-500 mt-2.5 font-medium">{allSessions[0].focus}</p>
                    </div>

                    <button className="w-full py-3 text-xs font-bold text-slate-700 bg-slate-100 rounded-2xl hover:bg-slate-200/70 transition-colors">
                      Ver analíticas detalladas
                    </button>
                  </div>
                ) : null}

              </div>

            </div>

          </div>
        </div>

      </div>

      {/* Class creation modal */}
      <CreateClassModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />

      {/* Unified Sessions Details Modal (Combining Summary & Transcript side-by-side) */}
      {selectedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm transition-opacity duration-300"
            onClick={handleCloseModal}
          />
          <div className="relative w-full max-w-6xl bg-[#f3f4f6] rounded-[32px] shadow-2xl border border-slate-100 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-200 h-[85vh] flex flex-col">
            
            {/* Modal Header */}
            <header className="px-8 py-5 border-b border-slate-200 bg-white flex justify-between items-center shrink-0">
              <div>
                <span className={`inline-block text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${selectedSession.subjectColor}`}>
                  {selectedSession.subject}
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-1">
                  Detalles de la Clase
                </h3>
              </div>
              <button 
                onClick={handleCloseModal}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            {/* Split content container */}
            <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">

              {/* Left Column (Recording bubble & AI summary) - ~45% width */}
              <div className="w-full md:w-[45%] p-6 md:p-8 flex flex-col gap-5 overflow-y-auto custom-scrollbar border-r border-slate-200">

                {/* Recording "message bubble" with inline player */}
                <div className="flex gap-3 items-start">
                 
                  <div className="flex-1 bg-slate-100 rounded-3xl rounded-tl-md p-5 flex flex-col gap-4">
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm leading-tight">Clase finalizada</h4>
                      <p className="text-xs text-slate-500 mt-0.5 font-medium">
                        {teacherName} · {selectedSession.duration}
                      </p>
                    </div>

                    {/* Inline player row */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setIsPlaying(!isPlaying)}
                        className="text-violet-600 hover:text-violet-700 transition active:scale-90 shrink-0"
                        title={isPlaying ? "Pausar" : "Reproducir"}
                      >
                        {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current" />}
                      </button>
                      <input
                        type="range"
                        className="flex-1 h-1.5 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-white"
                        min="0"
                        max="100"
                        value={playProgress}
                        onChange={(e) => setPlayProgress(Number(e.target.value))}
                      />
                      <span className="text-xs font-bold text-slate-500 tabular-nums shrink-0">
                        {selectedSession.duration}
                      </span>
                      <button
                        onClick={() => setIsMuted(!isMuted)}
                        className="text-slate-400 hover:text-slate-600 transition shrink-0"
                        title={isMuted ? "Activar sonido" : "Silenciar"}
                      >
                        {isMuted ? <VolumeX className="w-4 h-4 text-red-500" /> : <Volume2 className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={cyclePlaybackRate}
                        className="text-xs font-bold text-slate-500 hover:text-slate-700 transition shrink-0 tabular-nums w-10 text-right"
                        title="Cambiar velocidad"
                      >
                        {playbackRate}x
                      </button>
                    </div>
                  </div>
                </div>

                {/* AI Summary Card */}
                <div className="ml-[52px] bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col gap-4">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800 text-sm">Resumen de clase</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-violet-600 text-sm">
                      Potenciado por Kobi AI
                      <Sparkles className="w-3.5 h-3.5 text-violet-600 fill-violet-600" />
                    </span>
                  </div>

                  <ul className="space-y-3">
                    {selectedSession.summaryPoints.map((point, idx) => (
                      <li key={idx} className="flex gap-2.5 text-[13px] text-slate-600 leading-relaxed">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-2 shrink-0" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-1">
                    <h5 className="font-bold text-slate-800 text-sm mb-3">Próximos pasos</h5>
                    <ul className="space-y-2.5">
                      {selectedSession.nextSteps.map((step, idx) => (
                        <li key={idx} className="flex gap-2.5 text-[13px] text-slate-600 leading-relaxed">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-2 shrink-0" />
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

              </div>

              {/* Right Column (Transcript) - ~55% width */}
              <div className="w-full md:w-[55%] bg-white p-6 md:p-8 flex flex-col min-h-0">

                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 shrink-0">
                  Transcripción de clase
                </h4>

                {/* Session header card */}
                <div className="border border-slate-200 rounded-2xl p-4 mb-6 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                      <Mic className="w-5 h-5" />
                    </div>
                    <div>
                      <h5 className="font-bold text-slate-900 text-sm leading-tight">{selectedSession.title}</h5>
                      <p className="text-xs text-slate-400 font-medium mt-0.5">
                        {teacherName} · {selectedSession.duration}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-slate-400 tabular-nums shrink-0">
                    {selectedSession.date}
                  </span>
                </div>

                {/* Transcript dialogue listing */}
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-5 flex flex-col justify-start">
                  {selectedSession.transcript && selectedSession.transcript.length > 0 ? (
                    selectedSession.transcript.map((line, idx) => (
                      <div key={idx} className="flex gap-4 items-start w-full">
                        <span className="text-sm text-slate-400 tabular-nums shrink-0 mt-0.5 w-9">
                          {line.time}
                        </span>
                        <p className="text-[15px] leading-relaxed">
                          <span className="font-bold text-slate-900">{line.speaker}:</span>{" "}
                          <span className="text-slate-600">{line.text}</span>
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12 px-4 text-slate-400 my-auto">
                      <Mic className="h-10 w-10 mx-auto mb-2 opacity-50 text-slate-400" />
                      <p className="text-sm font-bold text-slate-600">No hay transcripción disponible</p>
                      <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                        Las clases grabadas se transcriben automáticamente en segundo plano. Los audios antiguos o locales pueden no tener texto guardado.
                      </p>
                    </div>
                  )}
                </div>

              </div>

            </div>

            {/* Footer close bar */}
            <footer className="px-8 py-4 border-t border-slate-200 bg-white flex justify-end shrink-0">
              <button 
                onClick={handleCloseModal}
                className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition"
              >
                Entendido
              </button>
            </footer>

          </div>
        </div>
      )}

    </main>
  );
}
