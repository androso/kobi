import { useState } from "react";
import { 
  FolderOpen, 
  Calendar, 
  Clock, 
  Filter, 
  TrendingUp, 
  Mail, 
  Bell, 
  Search, 
  X
} from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { CreateClassModal } from "./components/CreateClassModal";

// ---------------------------------------------------------------------------
// Mock previous classes data (all localized to Spanish)
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
    duration: "45 Minutos",
    iconColor: "text-emerald-600 bg-emerald-50",
    summary: "Se discutieron los niveles tróficos en el ecosistema. Los estudiantes mostraron gran interés al hablar sobre los descomponedores y el ciclo de la energía. Identificamos un malentendido común sobre si la energía se recicla de la misma forma que la materia. Se recomendó utilizar la actividad interactiva 'Cadena alimenticia'.",
    transcript: [
      { time: "10:05", speaker: "Sra. Henderson", text: "Buenos días clase, hoy exploraremos cómo fluye la energía a través de un ecosistema." },
      { time: "10:15", speaker: "Carlos", text: "¿La energía se recicla como el agua y la materia?" },
      { time: "10:16", speaker: "Sra. Henderson", text: "Excelente pregunta, Carlos. En realidad, la energía fluye de forma unidireccional y se disipa en forma de calor, no se recicla." },
      { time: "10:28", speaker: "María", text: "Entonces, ¿los productores siempre obtienen su energía del sol directamente?" },
      { time: "10:29", speaker: "Sra. Henderson", text: "Exacto, María. A través de la fotosíntesis." }
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
    duration: "60 Minutos",
    iconColor: "text-blue-600 bg-blue-50",
    summary: "Clase dedicada a resolver ecuaciones lineales simples. Practicamos el despeje de variables y el orden de operaciones (PEMDAS). La mayoría de los estudiantes resolvió con éxito los ejercicios prácticos individuales.",
    transcript: [
      { time: "09:02", speaker: "Sra. Henderson", text: "Hoy resolveremos ecuaciones lineales básicas. Recuerden aislar la variable en un lado de la igualdad." },
      { time: "09:20", speaker: "Sofía", text: "Si sumamos de un lado, ¿tenemos que sumar exactamente lo mismo del otro?" },
      { time: "09:21", speaker: "Sra. Henderson", text: "Es correcto, Sofía. Una ecuación funciona como una balanza en perfecto equilibrio." }
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
    duration: "50 Minutos",
    iconColor: "text-amber-600 bg-amber-50",
    summary: "Taller sobre los asentamientos antiguos y la agricultura prehispánica en Centroamérica. Los alumnos trabajaron en grupos pequeños investigando el sistema de cultivo por terrazas.",
    transcript: [
      { time: "11:10", speaker: "Sra. Henderson", text: "Hoy nos enfocaciones en las técnicas agrícolas utilizadas por las civilizaciones antiguas." },
      { time: "11:30", speaker: "Mateo", text: "¿El maíz era el único cultivo principal?" },
      { time: "11:31", speaker: "Sra. Henderson", text: "Principalmente sí, Mateo, pero también cultivaban frijol, calabaza y cacao." }
    ]
  }
];

export function PreviousClasses() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSession, setSelectedSession] = useState<typeof PREVIOUS_SESSIONS[0] | null>(null);
  const [activeModalType, setActiveModalType] = useState<"summary" | "transcript" | null>(null);

  const filteredSessions = PREVIOUS_SESSIONS.filter(
    (session) =>
      session.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.focus.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  function handleOpenModal(session: typeof PREVIOUS_SESSIONS[0], type: "summary" | "transcript") {
    setSelectedSession(session);
    setActiveModalType(type);
  }

  function handleCloseModal() {
    setSelectedSession(null);
    setActiveModalType(null);
  }

  return (
    <main className="min-h-screen bg-[#eef3fb] overflow-hidden">
      <div className="grid min-h-screen w-full lg:grid-cols-[240px_minmax(0,1fr)] bg-[#eef3fb]">
        
        {/* Left Sidebar */}
        <Sidebar onOpenCreateClass={() => setIsCreateModalOpen(true)} />
        
        {/* Main Content Area */}
        <div className="flex flex-col p-3 sm:p-4 lg:p-5 h-screen">
          <div className="flex-1 flex flex-col bg-[#f8f9ff] rounded-[30px] border border-slate-200/50 overflow-hidden shadow-sm min-h-0">
            
            {/* Header (Integrated Top Bar) */}
            <header className="h-[72px] shrink-0 flex items-center justify-between px-6 bg-white border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-800 uppercase tracking-wider">Historial de Clases</span>
              </div>
              
              {/* Search Bar */}
              <div className="flex-grow flex justify-center max-w-md mx-6">
                <div className="relative w-full">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
                  <input 
                    className="w-full bg-[#f1f5f9] border-none rounded-xl py-2 pl-11 pr-4 focus:ring-2 focus:ring-[#004ac6]/20 outline-none transition-all text-sm placeholder:text-slate-400 placeholder:italic" 
                    placeholder="Buscar por clase, tema o categoría..." 
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
              
              {/* User Avatar & Icons */}
              <div className="flex items-center gap-4">
                <button className="text-slate-500 hover:text-[#004ac6] transition-colors p-1" title="Notificaciones">
                  <Bell className="h-5 w-5" />
                </button>
                <div className="w-9 h-9 rounded-full border border-slate-200 overflow-hidden bg-violet-100 flex items-center justify-center text-xs font-bold text-violet-700">
                  SH
                </div>
              </div>
            </header>

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
                          
                          <div className="flex gap-2.5 self-end sm:self-center">
                            <button 
                              onClick={() => handleOpenModal(session, "summary")}
                              className="px-4 py-2 rounded-xl bg-slate-50 hover:bg-[#004ac6] text-slate-700 hover:text-white text-xs font-bold transition-all shadow-sm"
                            >
                              Resumen
                            </button>
                            <button 
                              onClick={() => handleOpenModal(session, "transcript")}
                              className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all"
                            >
                              Transcripción
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

      {/* Interactive Modal for Summary/Transcript */}
      {selectedSession && activeModalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm transition-opacity duration-300"
            onClick={handleCloseModal}
          />
          <div className="relative w-full max-w-xl bg-white rounded-[28px] shadow-2xl border border-slate-100 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col">
            <header className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <span className="text-[9px] font-bold uppercase tracking-widest text-[#004ac6]">
                  {selectedSession.subject}
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">
                  {activeModalType === "summary" ? "Resumen de Clase" : "Transcripción de Clase"}
                </h3>
              </div>
              <button 
                onClick={handleCloseModal}
                className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            <div className="p-6 overflow-y-auto flex-grow custom-scrollbar">
              <h4 className="font-bold text-slate-800 text-sm mb-3">{selectedSession.title}</h4>
              
              {activeModalType === "summary" ? (
                <div className="bg-slate-50 p-4.5 rounded-2xl border border-slate-100">
                  <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line font-medium">
                    {selectedSession.summary}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {selectedSession.transcript.map((line, idx) => (
                    <div key={idx} className="flex gap-4 items-start">
                      <span className="text-xs font-semibold text-slate-400 tabular-nums shrink-0 mt-0.5 w-10">
                        {line.time}
                      </span>
                      <p className="text-slate-700 text-[15px] leading-relaxed">
                        <span className="font-bold text-[#004ac6] mr-1.5">{line.speaker}:</span>
                        {line.text}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <footer className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
              <button 
                onClick={handleCloseModal}
                className="px-4.5 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-700 transition"
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
