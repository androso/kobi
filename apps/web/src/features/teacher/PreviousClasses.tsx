import { useState } from "react";
import {
  FolderOpen,
  Calendar,
  Clock,
  Filter,
  TrendingUp,
  Mail,
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
import { Header } from "./components/Header";
import { CreateClassModal } from "./components/CreateClassModal";

// ---------------------------------------------------------------------------
// Mock previous classes data (structured for the combined summary & transcript layout)
// ---------------------------------------------------------------------------
const PREVIOUS_SESSIONS = [
  {
    id: 1,
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
    id: 2,
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
    id: 3,
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

export function PreviousClasses() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSession, setSelectedSession] = useState<typeof PREVIOUS_SESSIONS[0] | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [playProgress, setPlayProgress] = useState(30);
  const [playbackRate, setPlaybackRate] = useState(1);

  const PLAYBACK_RATES = [1, 1.25, 1.5, 2, 0.5];
  function cyclePlaybackRate() {
    setPlaybackRate((rate) => {
      const idx = PLAYBACK_RATES.indexOf(rate);
      return PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length];
    });
  }

  const filteredSessions = PREVIOUS_SESSIONS.filter(
    (session) =>
      session.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.focus.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  function handleOpenDetailsModal(session: typeof PREVIOUS_SESSIONS[0]) {
    setSelectedSession(session);
    setIsPlaying(false);
    setPlayProgress(15);
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
            
            <Header />

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

              {/* Right Column: Stats & Profile Sidebar */}
              <div className="w-[300px] border-l border-slate-100 bg-white p-6 shrink-0 hidden xl:flex flex-col gap-6 overflow-y-auto custom-scrollbar">
                
                {/* Profile detail */}
                <div className="flex flex-col items-center text-center">
                  <span className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-5 self-start">Mi Perfil</span>
                  <div className="relative mb-3">
                    <div className="w-20 h-20 rounded-full border-4 border-[#004ac6]/10 p-0.5">
                      <div className="w-full h-full rounded-full bg-gradient-to-tr from-[#004ac6] to-violet-500 flex items-center justify-center text-white text-xl font-bold">
                        SH
                      </div>
                    </div>
                    <div className="absolute bottom-0.5 right-0.5 w-4 h-4 bg-emerald-500 border-2 border-white rounded-full"></div>
                  </div>
                  <h3 className="text-lg font-bold text-slate-800">Sra. Henderson</h3>
                  <p className="text-xs text-slate-400 font-semibold mt-0.5">Directora del Departamento de Ciencias</p>
                  
                  <div className="flex gap-2.5 mt-5">
                    <button className="w-9 h-9 rounded-full border border-slate-100 flex items-center justify-center hover:bg-slate-50 text-slate-500 transition-colors" title="Bandeja de entrada">
                      <Mail className="h-4 w-4" />
                    </button>
                    <button className="w-9 h-9 rounded-full border border-slate-100 flex items-center justify-center hover:bg-slate-50 text-slate-500 transition-colors" title="Calendario">
                      <Calendar className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="h-px bg-slate-100" />

                {/* Current Unit Progress */}
                <div className="space-y-5">
                  <div className="bg-[#f8f9ff] p-4.5 rounded-2xl border border-slate-100">
                    <p className="text-[9px] font-bold text-[#004ac6] uppercase tracking-widest mb-3">Enfoque Actual</p>
                    <div className="flex justify-between items-center mb-1.5">
                      <h4 className="font-bold text-sm text-slate-800">Ciencias - 4to Grado</h4>
                      <span className="text-xs font-extrabold text-[#004ac6]">64%</span>
                    </div>
                    <div className="w-full bg-slate-200/50 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-[#004ac6] h-full w-[64%]"></div>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2 font-semibold">Unidad 2: Ecosistemas</p>
                  </div>

                  {/* Vertically Aligned Metrics */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3.5 bg-white rounded-2xl border border-slate-100">
                      <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <Calendar className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total de Sesiones</p>
                        <p className="text-sm font-bold text-slate-800">142 Clases</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-3.5 bg-white rounded-2xl border border-slate-100">
                      <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                        <TrendingUp className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Participación Promedio</p>
                        <p className="text-sm font-bold text-slate-800">82% de Puntaje</p>
                      </div>
                    </div>
                  </div>

                  <button className="w-full py-2.5 text-xs font-bold text-[#004ac6] bg-[#e9f0fe] rounded-xl hover:bg-[#d8e5fd] transition-colors">
                    Ver analíticas detalladas
                  </button>
                </div>

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
                        Sra. Henderson · {selectedSession.duration}
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
                        Sra. Henderson · {selectedSession.duration}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-slate-400 tabular-nums shrink-0">
                    {selectedSession.date}
                  </span>
                </div>

                {/* Transcript dialogue listing */}
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-5">
                  {selectedSession.transcript.map((line, idx) => (
                    <div key={idx} className="flex gap-4 items-start">
                      <span className="text-sm text-slate-400 tabular-nums shrink-0 mt-0.5 w-9">
                        {line.time}
                      </span>
                      <p className="text-[15px] leading-relaxed">
                        <span className="font-bold text-slate-900">{line.speaker}:</span>{" "}
                        <span className="text-slate-600">{line.text}</span>
                      </p>
                    </div>
                  ))}
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
