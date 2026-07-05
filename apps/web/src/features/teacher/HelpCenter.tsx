import { useNavigate } from "react-router-dom";
import { ArrowRight, BookOpen, CheckCircle2, CircleHelp, Mail, MessageSquare, PhoneCall, ShieldQuestion } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";

const quickTopics = [
  {
    title: "Crear una clase",
    description: "Usa el flujo de nueva clase para definir grado, enfoque y temas clave en menos de un minuto.",
    action: "Abrir clases",
    path: "/teacher",
    icon: BookOpen,
  },
  {
    title: "Revisar sesiones anteriores",
    description: "Consulta resúmenes, transcripciones y detalles de clases pasadas desde el historial.",
    action: "Ver historial",
    path: "/teacher/repositories",
    icon: ShieldQuestion,
  },
  {
    title: "Analizar resultados",
    description: "Sigue la participación, los puntos de fricción y el progreso de la sesión en vivo.",
    action: "Abrir analíticas",
    path: "/teacher/analytics",
    icon: CheckCircle2,
  },
];

const faqs = [
  {
    question: "¿Cómo inicio una nueva clase?",
    answer: "Desde el panel docente, toca Nueva clase y completa el nombre, enfoque y temas clave. Kobi prepara el resto.",
  },
  {
    question: "¿Dónde veo el monitoreo en vivo?",
    answer: "Abre Monitoreo en vivo en el menú lateral para revisar participación, progreso y señales de fricción.",
  },
  {
    question: "¿Cómo contacto soporte?",
    answer: "Escribe a soporte@kobi.ai. Si el caso es sobre una clase específica, incluye el nombre de la sesión.",
  },
];

export function HelpCenter() {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen bg-[#eef3fb] overflow-hidden">
      <div className="grid min-h-screen w-full lg:grid-cols-[240px_minmax(0,1fr)] bg-[#eef3fb]">
        <Sidebar onOpenCreateClass={() => navigate("/teacher")} onOpenHelp={() => navigate("/teacher/ayuda")} />
        <div className="flex flex-col p-3 sm:p-4 lg:p-5 h-screen">
          <div className="flex-1 flex flex-col bg-[#f8f9ff] rounded-[30px] border border-slate-200/50 overflow-hidden shadow-sm min-h-0">
            <Header />
            <div className="flex-1 overflow-y-auto px-6 py-8 md:px-10">
              <div className="mx-auto max-w-6xl">
                <section className="mb-10">
                  <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-xs font-bold uppercase tracking-widest text-[#004ac6]">
                    <CircleHelp className="h-4 w-4" />
                    Centro de ayuda
                  </div>
                  <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
                    Ayuda rápida para volver a clase sin fricción
                  </h1>
                  <p className="mt-4 max-w-3xl text-base leading-7 text-slate-500">
                    Encuentra respuestas comunes, atajos del flujo docente y vías de contacto para resolver dudas sin
                    salir del portal.
                  </p>
                </section>

                <section className="grid gap-5 lg:grid-cols-3">
                  {quickTopics.map((topic) => {
                    const Icon = topic.icon;
                    return (
                      <article
                        className="rounded-[28px] border border-slate-100 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                        key={topic.title}
                      >
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e9f0fe] text-[#004ac6]">
                          <Icon className="h-6 w-6" />
                        </div>
                        <h2 className="mt-4 text-xl font-bold text-slate-900">{topic.title}</h2>
                        <p className="mt-2 text-sm leading-6 text-slate-500">{topic.description}</p>
                        <button
                          className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#004ac6] hover:underline"
                          onClick={() => navigate(topic.path)}
                          type="button"
                        >
                          {topic.action}
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      </article>
                    );
                  })}
                </section>

                <section className="mt-8 grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
                  <div className="rounded-[28px] border border-slate-100 bg-white p-6 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                        <MessageSquare className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold text-slate-900">Preguntas frecuentes</h2>
                        <p className="text-sm text-slate-500">Respuestas cortas para las tareas más comunes.</p>
                      </div>
                    </div>

                    <div className="mt-6 space-y-4">
                      {faqs.map((faq) => (
                        <div className="rounded-2xl bg-slate-50/80 p-4" key={faq.question}>
                          <p className="text-sm font-bold text-slate-900">{faq.question}</p>
                          <p className="mt-1 text-sm leading-6 text-slate-500">{faq.answer}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <aside className="rounded-[28px] border border-slate-100 bg-[#004ac6] p-6 text-white shadow-sm">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                      <Mail className="h-5 w-5" />
                    </div>
                    <h2 className="mt-4 text-2xl font-bold">Contacto directo</h2>
                    <p className="mt-2 text-sm leading-6 text-blue-100">
                      Si necesitas ayuda operativa o detectaste un problema en el portal, escribe al equipo de soporte.
                    </p>

                    <div className="mt-6 space-y-3">
                      <a
                        className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
                        href="mailto:soporte@kobi.ai"
                      >
                        <span>soporte@kobi.ai</span>
                        <Mail className="h-4 w-4" />
                      </a>
                      <div className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold text-white">
                        <span>Horario de respuesta</span>
                        <span>8:00 - 17:00</span>
                      </div>
                      <div className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold text-white">
                        <span>Canal de urgencias</span>
                        <PhoneCall className="h-4 w-4" />
                      </div>
                    </div>
                  </aside>
                </section>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
