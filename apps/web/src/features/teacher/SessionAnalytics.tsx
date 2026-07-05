import { useState, useEffect } from "react";
import { TrendingUp, CircleAlert, WifiOff } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";

// ---------------------------------------------------------------------------
// Datos de sesión simulados — reemplazar con datos en tiempo real del backend.
// ---------------------------------------------------------------------------
const SESSION = {
  subject: "Ciencias: Ecosistemas",
  grade: "8vo Grado - Sección B",
  activeStudents: "32/34",
  recall: 82,
  recallTrend: 4,
  recallNote: "Comprensión sólida de los 'Niveles tróficos'.",
  friction: [
    { count: 5, label: "Atascados en la Pregunta 3", action: "intervene" as const },
    { count: 2, label: "Alertas sin conexión", action: "offline" as const },
  ],
  completion: { percent: 65, completed: 21, inProgress: 11, waiting: 2 },
};

type Tone = "arena" | "hatching" | "stuck" | "complete";

const TONE: Record<
  Tone,
  { badge: string; bar: string; text: string; ring: string; avatar: string }
> = {
  arena: {
    badge: "border border-violet-300 text-violet-600 bg-violet-50",
    bar: "bg-violet-600",
    text: "text-violet-600",
    ring: "border-violet-200",
    avatar: "bg-violet-100 text-violet-700",
  },
  hatching: {
    badge: "border border-emerald-300 text-emerald-600 bg-emerald-50",
    bar: "bg-emerald-600",
    text: "text-emerald-600",
    ring: "border-emerald-200",
    avatar: "bg-emerald-100 text-emerald-700",
  },
  stuck: {
    badge: "bg-red-100 text-red-600",
    bar: "bg-red-500",
    text: "text-red-600",
    ring: "border-red-200",
    avatar: "bg-red-100 text-red-700",
  },
  complete: {
    badge: "border border-blue-300 text-[#004ac6] bg-blue-50",
    bar: "bg-[#004ac6]",
    text: "text-[#004ac6]",
    ring: "border-blue-200",
    avatar: "bg-blue-100 text-[#004ac6]",
  },
};

const STUDENTS: Array<{
  name: string;
  pet: string;
  stage: string;
  progress: number;
  tone: Tone;
}> = [
  { name: "Alex Rivera", pet: "Mascota: Sparky", stage: "En Arena", progress: 85, tone: "arena" },
  { name: "Maya Chen", pet: "Mascota: Leafy", stage: "Incubando", progress: 42, tone: "hatching" },
  { name: "Jordan Smith", pet: "Mascota: Bubbles", stage: "Atascado (P3)", progress: 12, tone: "stuck" },
  { name: "Sarah Bloom", pet: "Mascota: Hoot", stage: "Completo", progress: 100, tone: "complete" },
];

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// -- Sub-componentes ---------------------------------------------------------

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-4 py-2.5 rounded-2xl shadow-sm border border-slate-100">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-xl font-bold text-[#004ac6] tabular-nums">{value}</p>
    </div>
  );
}

function RecallCard() {
  return (
    <div className="col-span-12 lg:col-span-4 bg-indigo-100/60 p-7 rounded-3xl relative overflow-hidden flex flex-col justify-between h-[240px]">
      <div>
        <p className="text-[11px] font-bold text-indigo-900/60 uppercase tracking-widest mb-2">
          Retención general de la clase
        </p>
        <div className="flex items-baseline gap-2">
          <span className="text-[64px] font-bold text-indigo-950 leading-none">{SESSION.recall}%</span>
          <span className="flex items-center gap-0.5 font-bold bg-white/50 text-emerald-700 px-2 py-0.5 rounded-full text-sm">
            <TrendingUp className="h-4 w-4" />
            {SESSION.recallTrend}%
          </span>
        </div>
      </div>
      <div className="absolute right-[-20px] bottom-[-20px] opacity-10">
        <TrendingUp className="h-40 w-40 text-indigo-950" />
      </div>
      <div className="z-10">
        <div className="w-2/3 h-2.5 bg-white/60 rounded-full overflow-hidden">
          <div className="h-full bg-indigo-950 rounded-full" style={{ width: `${SESSION.recall}%` }} />
        </div>
        <p className="text-sm text-indigo-900/70 mt-2 font-medium">{SESSION.recallNote}</p>
      </div>
    </div>
  );
}

function FrictionCard() {
  return (
    <div className="col-span-12 md:col-span-6 lg:col-span-4 bg-rose-100/60 p-7 rounded-3xl flex flex-col h-[240px]">
      <div className="flex justify-between items-start mb-4">
        <p className="text-[11px] font-bold text-red-600/60 uppercase tracking-widest">Puntos de fricción</p>
        <CircleAlert className="h-7 w-7 text-red-500/50" />
      </div>
      <div className="space-y-3">
        {SESSION.friction.map((f) => (
          <div
            key={f.label}
            className={`flex items-center justify-between p-3 bg-white rounded-2xl shadow-sm ${
              f.action === "offline" ? "opacity-80" : ""
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                  f.action === "intervene" ? "bg-red-500 text-white" : "bg-red-100 text-red-600"
                }`}
              >
                {f.count}
              </span>
              <span className="text-sm text-slate-700 font-medium">{f.label}</span>
            </div>
            {f.action === "intervene" ? (
              <button className="text-red-600 font-bold text-[10px] uppercase tracking-wide hover:underline">
                Intervenir
              </button>
            ) : (
              <WifiOff className="h-4 w-4 text-red-400/60" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CompletionCard() {
  const { percent, completed, inProgress, waiting } = SESSION.completion;
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percent / 100);

  return (
    <div className="col-span-12 md:col-span-6 lg:col-span-4 bg-amber-100/50 p-7 rounded-3xl flex flex-col h-[240px]">
      <p className="text-[11px] font-bold text-slate-500/70 uppercase tracking-widest mb-4">
        Progreso de la sesión
      </p>
      <div className="flex items-center justify-center flex-grow gap-6">
        <div className="relative h-28 w-28 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90">
            <circle className="text-emerald-600/10" cx="56" cy="56" fill="transparent" r={radius} stroke="currentColor" strokeWidth="10" />
            <circle
              className="text-emerald-600"
              cx="56"
              cy="56"
              fill="transparent"
              r={radius}
              stroke="currentColor"
              strokeWidth="10"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute text-[28px] font-bold text-emerald-700">{percent}%</span>
        </div>
        <div className="space-y-1.5">
          <LegendRow dot="bg-emerald-600" value={completed} label="Completado" />
          <LegendRow dot="bg-emerald-600/40" value={inProgress} label="En progreso" />
          <LegendRow dot="bg-slate-300" value={waiting} label="En espera" />
        </div>
      </div>
    </div>
  );
}

function LegendRow({ dot, value, label }: { dot: string; value: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      <p className="text-[11px] text-slate-500 uppercase tracking-wide">
        <span className="font-bold text-slate-800">{value}</span> {label}
      </p>
    </div>
  );
}

function StudentRow({ student }: { student: (typeof STUDENTS)[number] }) {
  const tone = TONE[student.tone];
  return (
    <tr className={`hover:bg-slate-50/60 transition-colors ${student.tone === "stuck" ? "bg-red-50/50" : ""}`}>
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-full border-2 ${tone.ring} flex items-center justify-center text-sm font-bold ${tone.avatar}`}>
            {initials(student.name)}
          </div>
          <div>
            <p className="font-bold text-slate-800 text-sm">{student.name}</p>
            <p className="text-xs text-slate-400">{student.pet}</p>
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <span className={`px-3 py-1.5 rounded-full text-[10px] uppercase font-bold ${tone.badge}`}>
          {student.stage}
        </span>
      </td>
      <td className="px-6 py-4 w-72">
        <div className="flex items-center gap-3">
          <div className="flex-grow h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${student.progress}%` }} />
          </div>
          <span className={`text-xs font-bold ${tone.text}`}>{student.progress}%</span>
        </div>
      </td>
    </tr>
  );
}

// -- Página ------------------------------------------------------------------

export function SessionAnalytics() {
  const [elapsed, setElapsed] = useState(25 * 60 + 59);

  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <main className="min-h-screen bg-[#eef3fb] overflow-hidden">
      <div className="grid min-h-screen w-full lg:grid-cols-[240px_minmax(0,1fr)] bg-[#eef3fb]">
        <Sidebar />
        <div className="flex flex-col p-3 sm:p-4 lg:p-5 h-screen">
          <div className="flex-1 flex flex-col bg-[#f8f9ff] rounded-[30px] border border-slate-200/50 overflow-hidden shadow-sm min-h-0">
            <Header />
            <div className="flex-1 overflow-y-auto p-6 lg:p-8">
              <div className="max-w-[1400px] mx-auto">

                {/* Session header */}
                <div className="flex justify-between items-end mb-8 flex-wrap gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] uppercase font-bold tracking-wider">
                        Sesión en vivo
                      </span>
                      <span className="text-sm text-slate-500">
                        {SESSION.subject} • {SESSION.grade}
                      </span>
                    </div>
                    <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Monitor en tiempo real</h1>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatChip label="Tiempo de sesión" value={formatTime(elapsed)} />
                    <StatChip label="Estudiantes activos" value={SESSION.activeStudents} />
                  </div>
                </div>

                {/* Bento metrics */}
                <div className="grid grid-cols-12 gap-5 mb-8">
                  <RecallCard />
                  <FrictionCard />
                  <CompletionCard />
                </div>

                {/* Student activity table */}
                <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center flex-wrap gap-3">
                    <h3 className="text-xl font-bold text-slate-900">Estado de actividad de estudiantes</h3>
                    <div className="flex gap-2">
                      <span className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-slate-200">
                        <span className="w-2 h-2 rounded-full bg-violet-600" />
                        <span className="text-[10px] font-bold text-violet-600 uppercase">Arena</span>
                      </span>
                      <span className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-slate-200">
                        <span className="w-2 h-2 rounded-full bg-emerald-600" />
                        <span className="text-[10px] font-bold text-emerald-600 uppercase">Incubando</span>
                      </span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/50">
                          <th className="px-6 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Estudiante</th>
                          <th className="px-6 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Etapa actual</th>
                          <th className="px-6 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Progreso</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {STUDENTS.map((s) => (
                          <StudentRow key={s.name} student={s} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="p-4 text-center border-t border-slate-100">
                    <button className="text-sm font-bold text-[#004ac6] hover:underline">
                      Ver los 34 estudiantes
                    </button>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
