import { useState, useEffect, useRef } from "react";
import {
  Pause,
  StopCircle,
  Sparkles,
  AlertTriangle,
  Leaf,
  Copy,
  FileDown,
  ChevronDown,
} from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { WaveformVisualizer } from "./components/WaveformVisualizer";
import { useClassStore } from "../../lib/store";

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

// Entradas de transcripción — texto final más un segmento "interino" opcional
// (aún siendo reconocido) que se muestra en gris. El backend transmitirá estas entradas.
const MOCK_TRANSCRIPT: Array<{
  time: string;
  text: string;
  interim?: string;
}> = [
  {
    time: "10:48",
    text: "Bien, hoy vamos a ver cómo se mueve la energía a través de un ecosistema — no la materia, la energía específicamente.",
  },
  {
    time: "10:50",
    text: "El sol es nuestro punto de partida. La energía solar se convierte en energía química mediante la fotosíntesis, lo que sustenta casi toda la vida en la Tierra.",
  },
  {
    time: "10:52",
    text: "A medida que subimos cada nivel trófico, recuerden que una gran parte de esa energía se pierde como calor, por eso la",
    interim: " pirámide de energía se hace más pequeña",
  },
];

const IDIOMA = "Español";

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
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-violet-500 animate-bounce" />
        <span className="text-sm text-slate-600">
          Kobi está buscando repositorios / preparando 3 actividades...
        </span>
      </div>
      <div className="flex gap-1">
        <div className="w-2 h-2 rounded-full bg-violet-300" />
        <div className="w-2 h-2 rounded-full bg-violet-400" />
        <div className="w-2 h-2 rounded-full bg-violet-600" />
      </div>
    </div>
  );
}

function TranscriptPlayerCard({
  elapsed,
  remaining,
}: {
  elapsed: number;
  remaining: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  return (
    <div className="bg-white rounded-[20px] shadow-sm border border-slate-200 overflow-hidden flex flex-col flex-1 min-h-0">
      {/* Encabezado de transcripción */}
      <div className="flex items-center justify-between px-6 pt-5 pb-3 shrink-0">
        <span className="text-[10px] font-bold tracking-widest uppercase text-slate-400">
          Transcripción en vivo
        </span>
        <span className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase text-emerald-600">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          En vivo
        </span>
      </div>

      {/* Cuerpo de la transcripción (desplazable) */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-6 flex flex-col gap-4">
        {MOCK_TRANSCRIPT.map((entry, i) => (
          <div key={i} className="flex gap-4 items-start">
            <span className="text-xs font-semibold text-slate-400 tabular-nums shrink-0 mt-0.5 w-10">
              {entry.time}
            </span>
            <p className="text-slate-700 text-[15px] leading-relaxed">
              {entry.text}
              {entry.interim && (
                <span className="text-slate-400">{entry.interim}</span>
              )}
            </p>
          </div>
        ))}
      </div>

      {/* Acciones: copiar / exportar + idioma */}
      <div className="flex items-center justify-between px-6 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide text-slate-500 hover:bg-slate-100 transition-colors active:scale-95"
            type="button"
          >
            <Copy className="h-3.5 w-3.5" />
            Copiar
          </button>
          <button
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide text-slate-500 hover:bg-slate-100 transition-colors active:scale-95"
            type="button"
          >
            <FileDown className="h-3.5 w-3.5" />
            Exportar
          </button>
        </div>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-50 transition-colors"
          type="button"
        >
          {IDIOMA}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Visualizador de forma de onda */}
      <div className="h-24 bg-[#f8f7f5] border-y border-slate-200 px-4 shrink-0">
        <WaveformVisualizer />
      </div>

      {/* Controles de reproducción */}
      <div className="bg-slate-50 px-6 py-4 flex items-center justify-between shrink-0">
        <span className="text-sm font-bold text-slate-500 tabular-nums">
          {formatTime(elapsed)}
        </span>

        <div className="flex items-center gap-3">
          <button
            className="w-11 h-11 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-all active:scale-90"
            type="button"
          >
            <Pause className="h-5 w-5" />
          </button>
          <button
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
        <div className="bg-slate-50 rounded-2xl p-4 border-l-4 border-violet-500">
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

// -- Página ------------------------------------------------------------------

export function LiveClassMonitor() {
  const [elapsed, setElapsed] = useState(12 * 60 + 41);

  const monitoringClassId = useClassStore((state) => state.monitoringClassId);
  const classes = useClassStore((state) => state.classes);
  const monitoringClass = classes.find((c) => c.id === monitoringClassId) ?? null;

  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = MOCK_INSIGHTS.totalSeconds - elapsed;

  return (
    <main className="min-h-screen bg-[#eef3fb] overflow-hidden">
      <div className="grid min-h-screen w-full lg:grid-cols-[240px_minmax(0,1fr)] bg-[#eef3fb]">
        <Sidebar />
        <div className="flex flex-col p-3 sm:p-4 lg:p-5 h-screen">
          <div className="flex-1 flex flex-col bg-[#f8f9ff] rounded-[30px] border border-slate-200/50 overflow-hidden shadow-sm min-h-0">
            <Header />
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 min-h-0">
              {/* Session header — clase que se está monitoreando */}
              <div className="flex items-center justify-between flex-wrap gap-3 shrink-0">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-50 text-red-600 rounded-full text-[10px] font-bold uppercase tracking-wider">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      Sesión en vivo
                    </span>
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
                  <TranscriptPlayerCard elapsed={elapsed} remaining={remaining} />
                </div>
                <div className="col-span-5 min-h-0">
                  <InsightsPanel />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <SuggestedActivityFAB activity={MOCK_INSIGHTS.suggestedActivity} />
    </main>
  );
}
