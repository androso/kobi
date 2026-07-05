import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  PlayCircle,
  Mail,
} from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";

type HelpContext = "dashboard" | "monitor" | "repositories" | "analytics";

type HelpAction = {
  label: string;
  kind: "navigate" | "mailto";
  to?: string;
  href?: string;
};

type HelpTopic = {
  title: string;
  description: string;
  icon: typeof Search;
  tags: string[];
  contexts: HelpContext[];
  action: HelpAction;
};

type HelpFAQ = {
  question: string;
  answer: string;
  tags: string[];
};

const contextMeta: Record<
  HelpContext,
  {
    eyebrow: string;
    title: string;
    description: string;
  }
> = {
  dashboard: {
    eyebrow: "Panel docente",
    title: "Empieza desde el panel",
    description: "Atajos para crear clases, revisar estado y preparar la siguiente sesión.",
  },
  monitor: {
    eyebrow: "Monitoreo en vivo",
    title: "Ayuda para la clase en curso",
    description: "Resuelve dudas sobre transcripción, participación y señales de fricción.",
  },
  repositories: {
    eyebrow: "Clases anteriores",
    title: "Revisión de sesiones pasadas",
    description: "Encuentra resúmenes, transcripciones y detalles históricos más rápido.",
  },
  analytics: {
    eyebrow: "Analíticas",
    title: "Lectura de resultados",
    description: "Interpreta métricas, progreso y señales para tomar decisiones con Kobi.",
  },
};

const helpTopics: HelpTopic[] = [
  {
    title: "Crear una clase",
    description: "Abre el flujo de nueva clase para definir nombre, grado, materia y unidad.",
    icon: Sparkles,
    tags: ["clase", "crear", "sesión", "nueva"],
    contexts: ["dashboard", "repositories", "analytics"],
    action: { label: "Abrir panel", kind: "navigate", to: "/teacher" },
  },
  {
    title: "Ver monitoreo en vivo",
    description: "Revisa la sesión activa, la transcripción y los puntos de fricción.",
    icon: PlayCircle,
    tags: ["monitor", "vivo", "transcripción", "fricción"],
    contexts: ["dashboard", "monitor", "analytics"],
    action: { label: "Ir al monitoreo", kind: "navigate", to: "/teacher/monitor" },
  },
  {
    title: "Revisar clases anteriores",
    description: "Consulta resúmenes, transcripciones y detalles de sesiones previas.",
    icon: BookOpen,
    tags: ["historial", "clases", "sesiones", "resúmenes"],
    contexts: ["dashboard", "repositories", "analytics"],
    action: { label: "Abrir historial", kind: "navigate", to: "/teacher/repositories" },
  },
  {
    title: "Analizar resultados",
    description: "Interpreta participación, progreso y puntos de fricción por estudiante.",
    icon: LayoutGrid,
    tags: ["analíticas", "progreso", "participación", "resultados"],
    contexts: ["dashboard", "monitor", "analytics"],
    action: { label: "Ver analíticas", kind: "navigate", to: "/teacher/analytics" },
  },
  {
    title: "Actividades y variantes",
    description: "Revisa apoyo, base y reto para ajustar dificultad sin cambiar el objetivo.",
    icon: Users2,
    tags: ["variantes", "apoyo", "reto", "actividad"],
    contexts: ["dashboard", "monitor", "repositories"],
    action: { label: "Volver al panel", kind: "navigate", to: "/teacher" },
  },
  {
    title: "Consejos docentes",
    description: "Encuentra orientación práctica para ritmo, retroalimentación y aprobación.",
    icon: Lightbulb,
    tags: ["consejos", "aprobación", "feedback", "ritmo"],
    contexts: ["dashboard", "analytics", "repositories"],
    action: { label: "Abrir historial", kind: "navigate", to: "/teacher/repositories" },
  },
  {
    title: "Contactar soporte",
    description: "Escribe al equipo si algo bloquea tu clase, acceso o configuración.",
    icon: CircleHelp,
    tags: ["soporte", "ayuda", "correo", "bloqueo"],
    contexts: ["dashboard", "monitor", "repositories", "analytics"],
    action: { label: "Enviar correo", kind: "mailto", href: "mailto:soporte@kobi.ai" },
  },
  {
    title: "Configuración",
    description: "Ajusta preferencias del portal y del espacio docente.",
    icon: Settings2,
    tags: ["configuración", "portal", "preferencias"],
    contexts: ["dashboard", "analytics"],
    action: { label: "Abrir panel", kind: "navigate", to: "/teacher" },
  },
  {
    title: "Notas y evidencias",
    description: "Guarda observaciones, seguimientos y evidencia de clase.",
    icon: MessageSquare,
    tags: ["notas", "evidencia", "observaciones", "seguimiento"],
    contexts: ["repositories", "analytics"],
    action: { label: "Ver clases anteriores", kind: "navigate", to: "/teacher/repositories" },
  },
];

const faqs: HelpFAQ[] = [
  {
    question: "¿Cómo inicio una nueva clase?",
    answer: "Desde el panel docente, toca Nueva clase y completa el nombre, grado, materia y unidad. Kobi prepara el resto.",
    tags: ["clase", "crear", "nueva"],
  },
  {
    question: "¿Dónde veo el monitoreo en vivo?",
    answer: "Abre Monitoreo en vivo en el menú lateral para revisar participación, progreso y señales de fricción.",
    tags: ["monitor", "vivo", "transcripción"],
  },
  {
    question: "¿Cómo contacto soporte?",
    answer: "Escribe a soporte@kobi.ai. Si el caso es sobre una clase específica, incluye el nombre de la sesión.",
    tags: ["soporte", "correo", "ayuda"],
  },
  {
    question: "¿Cómo reviso una sesión pasada?",
    answer: "En Clases anteriores puedes abrir cada sesión, leer el resumen y revisar la transcripción completa.",
    tags: ["historial", "sesión", "resumen"],
  },
  {
    question: "¿Qué hago si no aparece una actividad?",
    answer: "Revisa si la clase fue aprobada y si la variante correcta está disponible en el panel de actividades.",
    tags: ["actividad", "aprobación", "variantes"],
  },
];

function normalize(value: string) {
  return value.toLowerCase().trim();
}

function matchesQuery(text: string, query: string) {
  return normalize(text).includes(normalize(query));
}

function hashString(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function HelpCenter() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const context = (searchParams.get("from") as HelpContext) || "dashboard";
  const meta = contextMeta[context] ?? contextMeta.dashboard;

  const results = useMemo(() => {
    const q = query.trim();
    const filteredTopics = helpTopics
      .filter((topic) => {
        if (!q) return true;
        return (
          matchesQuery(topic.title, q) ||
          matchesQuery(topic.description, q) ||
          topic.tags.some((tag) => matchesQuery(tag, q))
        );
      })
      .sort((a, b) => Number(b.contexts.includes(context)) - Number(a.contexts.includes(context)));

    const filteredFaqs = faqs.filter((faq) => {
      if (!q) return true;
      return (
        matchesQuery(faq.question, q) ||
        matchesQuery(faq.answer, q) ||
        faq.tags.some((tag) => matchesQuery(tag, q))
      );
    });

    return { filteredTopics, filteredFaqs };
  }, [context, query]);

  const featuredTopicIndexes = useMemo(() => {
    const total = results.filteredTopics.length;
    if (total === 0) return new Set<number>();

    const firstRowSize = Math.min(3, total);
    const seed = hashString(`${context}|${query.trim() || "default"}`);
    const firstPick = seed % firstRowSize;

    const secondRowStart = 3;
    const secondRowEnd = Math.min(6, total);
    const secondRowCandidates = Array.from(
      { length: Math.max(0, secondRowEnd - secondRowStart) },
      (_, index) => secondRowStart + index
    );

    let secondPick =
      secondRowCandidates.length > 0
        ? secondRowCandidates[seed % secondRowCandidates.length]
        : firstPick;

    const supportIndex = results.filteredTopics.findIndex((topic) => topic.title === "Contactar soporte");
    if (supportIndex >= 0 && supportIndex + 1 < total) {
      secondPick = supportIndex + 1;
    }

    if (secondPick === firstPick) {
      secondPick = (firstPick + 1) % total;
    }

    return new Set([firstPick, secondPick]);
  }, [results.filteredTopics]);

  function handleAction(action: HelpAction) {
    if (action.kind === "mailto" && action.href) {
      window.location.href = action.href;
      return;
    }

    if (action.kind === "navigate" && action.to) {
      navigate(action.to);
    }
  }

  return (
    <main className="min-h-screen bg-[#eef3fb] overflow-hidden">
      <div className="grid min-h-screen w-full lg:grid-cols-[240px_minmax(0,1fr)] bg-[#eef3fb]">
        <Sidebar onOpenHelp={() => navigate(`/teacher/ayuda?from=${context}`)} />
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

                <section className="mb-6 overflow-hidden rounded-[2rem] bg-[#9f75f6] px-7 py-10 text-white shadow-[0_20px_60px_rgba(159,117,246,0.18)] sm:px-10 lg:px-12 lg:py-14">
                  <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/75">
                        {meta.eyebrow}
                      </p>
                      <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Kobi</h1>
                      <p className="mt-4 max-w-xl text-lg leading-8 text-white/85">{meta.description}</p>
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

                <div className="mb-8 rounded-[1.6rem] border border-slate-200/80 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <Search className="h-5 w-5 text-slate-400" />
                    <input
                      aria-label="Buscar ayuda"
                      className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Buscar en Kobi: monitoreo, clases, soporte..."
                      value={query}
                    />
                  </div>
                </div>

                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                      Recomendado para esta sección
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-slate-950">{meta.title}</h2>
                  </div>
                  <div className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700">
                    {results.filteredTopics.length} temas
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {results.filteredTopics.map((card, index) => {
                    const Icon = card.icon;
                    const featured = featuredTopicIndexes.has(index);

                    return (
                      <button
                        className={`group rounded-[1.6rem] border p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                          featured
                            ? "border-transparent bg-[#a173f7] text-white shadow-[0_18px_40px_rgba(161,115,247,0.24)]"
                            : "border-slate-200/80 bg-white"
                        }`}
                        key={card.title}
                        onClick={() => handleAction(card.action)}
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
                        <div className={`mt-5 inline-flex items-center gap-2 text-sm font-bold ${featured ? "text-white" : "text-[#004ac6]"}`}>
                          {card.action.label}
                          <ChevronRight className="h-4 w-4" />
                        </div>
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
                        onClick={() => navigate("/teacher/monitor")}
                        type="button"
                      >
                        <span>Ir al monitoreo</span>
                        <ChevronRight className="h-4 w-4" />
                      </button>
                      <a
                        className="flex items-center justify-between rounded-2xl bg-white/8 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/12"
                        href="mailto:soporte@kobi.ai"
                      >
                        <span>soporte@kobi.ai</span>
                        <Mail className="h-4 w-4" />
                      </a>
                    </div>
                  </aside>
                </div>

                <section className="mt-14">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Preguntas frecuentes</p>
                      <h2 className="mt-2 text-2xl font-semibold text-slate-950">Respuestas rápidas para Kobi</h2>
                    </div>
                    <div className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700">
                      {results.filteredFaqs.length} respuestas
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    {results.filteredFaqs.map((faq) => (
                      <button
                        className="rounded-[1.5rem] border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                        key={faq.question}
                        type="button"
                      >
                        <p className="text-base font-semibold text-slate-950">{faq.question}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{faq.answer}</p>
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
