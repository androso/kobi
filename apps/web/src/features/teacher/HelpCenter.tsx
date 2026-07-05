import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  CircleHelp,
  LayoutGrid,
  Lightbulb,
  MessageSquare,
  Search,
  Settings2,
  Sparkles,
  Users2,
  Volume2,
  ChevronRight,
} from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";

type HelpLink = {
  label: string;
  active?: boolean;
};

type HelpGroup = {
  title: string;
  links: HelpLink[];
};

const helpGroups: HelpGroup[] = [
  {
    title: "Para empezar",
    links: [
      { label: "Qué es Kobi" },
      { label: "Entender las clases" },
      { label: "Crear tu primera sesión" },
      { label: "Actividades y variantes" },
    ],
  },
  {
    title: "Referencia de Kobi",
    links: [
      { label: "Portal de Kobi", active: true },
      { label: "Búsqueda rápida" },
      { label: "Vistas" },
      { label: "Sesiones" },
      { label: "Estudiantes" },
      { label: "Reportes" },
    ],
  },
  {
    title: "Soporte",
    links: [
      { label: "Contactar soporte" },
      { label: "Videos de apoyo" },
      { label: "Problemas comunes" },
    ],
  },
];

const featureCards = [
  {
    title: "Búsqueda rápida",
    description: "Encuentra clases, estudiantes o sesiones recientes en segundos.",
    icon: Search,
  },
  {
    title: "Vistas",
    description: "Cambia entre resumen, monitoreo en vivo e historial.",
    icon: LayoutGrid,
  },
  {
    title: "Registros",
    description: "Consulta sesiones, prompts y evidencias asociadas a cada clase.",
    icon: BookOpen,
  },
  {
    title: "Sesiones de clase",
    description: "Crea, ejecuta y revisa sesiones desde un solo lugar.",
    icon: Sparkles,
  },
  {
    title: "Estudiantes",
    description: "Ve quién está activo, atascado o listo para la siguiente actividad.",
    icon: Users2,
  },
  {
    title: "Notas",
    description: "Guarda recordatorios, seguimientos y observaciones de clase.",
    icon: MessageSquare,
  },
  {
    title: "Ayuda",
    description: "Abre el canal de contacto si necesitas ayuda con Kobi o tu clase.",
    icon: CircleHelp,
  },
  {
    title: "Configuración",
    description: "Ajusta preferencias del portal y del espacio docente.",
    icon: Settings2,
  },
  {
    title: "Consejos docentes",
    description: "Usa recomendaciones prácticas para ritmo, retroalimentación y aprobación.",
    icon: Lightbulb,
  },
];

export function HelpCenter() {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen bg-[#eef3fb] overflow-hidden">
      <div className="grid min-h-screen w-full lg:grid-cols-[240px_minmax(0,1fr)] bg-[#eef3fb]">
        <Sidebar onOpenHelp={() => navigate("/teacher/ayuda")} />
        <div className="flex flex-col p-3 sm:p-4 lg:p-5 h-screen">
          <div className="flex-1 flex flex-col bg-[#f8f9ff] rounded-[30px] border border-slate-200/50 overflow-hidden shadow-sm min-h-0">
            <Header />
            <div className="flex-1 overflow-y-auto px-6 py-8 md:px-10">
              <div className="mx-auto max-w-6xl">
                <div className="mb-6 flex items-center gap-2 text-sm text-slate-500">
                  <button
                    className="rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-700"
                    onClick={() => navigate("/teacher")}
                    type="button"
                  >
                    Centro de ayuda
                  </button>
                  <span>/</span>
                  <span>Referencia</span>
                </div>

                <section className="mb-10 overflow-hidden rounded-[2rem] bg-[#9f75f6] px-7 py-10 text-white shadow-[0_20px_60px_rgba(159,117,246,0.18)] sm:px-10 lg:px-12 lg:py-14">
                  <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/75">Centro de ayuda</p>
                      <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Kobi</h1>
                      <p className="mt-4 max-w-xl text-lg leading-8 text-white/85">
                        Ve la misma información de clase en distintas formas, según lo que necesites revisar.
                      </p>
                    </div>

                    <div className="relative min-h-[170px]">
                      <div className="absolute left-10 top-4 h-24 w-24 rounded-2xl border-2 border-white/70" />
                      <div className="absolute left-28 top-10 h-16 w-40 rounded-full border-2 border-white/75" />
                      <div className="absolute right-8 top-8 h-20 w-40 rounded-full border-2 border-slate-700 bg-white" />
                      <div className="absolute left-6 right-6 top-0 border-t-2 border-dashed border-white/60" />
                      <div className="absolute left-6 bottom-0 top-0 border-l-2 border-dashed border-white/60" />
                      <div className="absolute right-6 bottom-0 top-0 border-r-2 border-dashed border-white/60" />
                    </div>
                  </div>
                </section>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {featureCards.map((card, index) => {
                    const Icon = card.icon;
                    const featured = index === 0 || index === 6;

                    return (
                      <button
                        className={`group rounded-[1.6rem] border p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                          featured
                            ? "border-transparent bg-[#a173f7] text-white shadow-[0_18px_40px_rgba(161,115,247,0.24)]"
                            : "border-slate-200/80 bg-white"
                        }`}
                        key={card.title}
                        type="button"
                      >
                        <div
                          className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                            featured ? "bg-white/15 text-white" : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <h2 className={`mt-4 text-xl font-semibold ${featured ? "text-white" : "text-slate-950"}`}>
                          {card.title}
                        </h2>
                        <p className={`mt-2 text-sm leading-6 ${featured ? "text-white/85" : "text-slate-600"}`}>
                          {card.description}
                        </p>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-14 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                  <section className="rounded-[1.75rem] bg-white p-7 shadow-sm ring-1 ring-slate-200/70">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                          Más de la referencia
                        </p>
                        <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                          Aprende los patrones principales de Kobi
                        </h2>
                      </div>
                      <button
                        className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
                        onClick={() => navigate("/teacher/analytics")}
                        type="button"
                      >
                        Abrir analíticas
                      </button>
                    </div>

                    <div className="mt-6 grid gap-4 sm:grid-cols-2">
                      <div className="rounded-3xl border border-slate-200 p-5">
                        <p className="text-lg font-semibold text-slate-950">Sesiones</p>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          Revisa transcripciones, resúmenes y resultados de cada sesión.
                        </p>
                      </div>
                      <div className="rounded-3xl border border-slate-200 p-5">
                        <p className="text-lg font-semibold text-slate-950">Estudiantes</p>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          Ve actividad en vivo, progreso y puntos de fricción de un vistazo.
                        </p>
                      </div>
                      <div className="rounded-3xl border border-slate-200 p-5">
                        <p className="text-lg font-semibold text-slate-950">Soporte</p>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          Contacta al equipo si necesitas ayuda con el flujo de clase, acceso o configuración.
                        </p>
                      </div>
                      <div className="rounded-3xl border border-slate-200 p-5">
                        <p className="text-lg font-semibold text-slate-950">Búsqueda rápida</p>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          Salta a cualquier sección del portal sin salir de la página.
                        </p>
                      </div>
                    </div>
                  </section>

                  <aside className="rounded-[1.75rem] bg-slate-950 p-7 text-white shadow-sm">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                      <Volume2 className="h-5 w-5" />
                    </div>
                    <h2 className="mt-4 text-2xl font-semibold">¿Necesitas ayuda en vivo?</h2>
                    <p className="mt-3 text-sm leading-6 text-slate-300">
                      Usa este centro para orientación rápida o contacta soporte si algo está bloqueando tu clase.
                    </p>

                    <div className="mt-6 space-y-3">
                      <button
                        className="flex w-full items-center justify-between rounded-2xl bg-white/8 px-4 py-3 text-left text-sm font-semibold text-white transition hover:bg-white/12"
                        onClick={() => navigate("/teacher")}
                        type="button"
                      >
                        <span>Volver al portal docente</span>
                        <ChevronRight className="h-4 w-4" />
                      </button>
                      <a
                        className="flex items-center justify-between rounded-2xl bg-white/8 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/12"
                        href="mailto:soporte@kobi.ai"
                      >
                        <span>soporte@kobi.ai</span>
                        <MessageSquare className="h-4 w-4" />
                      </a>
                    </div>
                  </aside>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
