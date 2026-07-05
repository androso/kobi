import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Globe,
  GraduationCap,
  HelpCircle,
  Laptop,
  Lock,
  Microscope,
  NotebookPen,
  Paintbrush,
  PencilRuler,
  PlayCircle,
  RotateCcw,
  Search,
  ShieldCheck,
  Target,
  type LucideIcon,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import {
  findClassByCode,
  selectClassArtefactos,
  useAuthStore,
  useClassStore,
} from "../../lib/store";
import { StudentSidebar, type StudentSidebarNavItem } from "./components/StudentSidebar";

const studentNavItems: readonly StudentSidebarNavItem[] = [
  {
    label: "Artefactos",
    path: "/student/asignaciones",
    icon: PlayCircle,
  },
  {
    label: "Progreso",
    path: "/student/progreso",
    icon: ShieldCheck,
  },
] as const;

// Pastel palettes + line-art icons cycled across the assignment cards, echoing
// the reference course grid (mint / peach / rose / periwinkle / stone / cream).
const cardStyles = [
  { bg: "bg-[#e3f3ee]", ring: "ring-[#c5e6dd]", icon: "text-[#2f9e8f]", title: "text-[#1f7a6e]" },
  { bg: "bg-[#fbe9de]", ring: "ring-[#f3d4c1]", icon: "text-[#d9825b]", title: "text-[#b5673f]" },
  { bg: "bg-[#f5e3e3]", ring: "ring-[#e9caca]", icon: "text-[#c56d6d]", title: "text-[#9d5252]" },
  { bg: "bg-[#e7e9f5]", ring: "ring-[#d0d4ec]", icon: "text-[#5c6cb8]", title: "text-[#45529a]" },
  { bg: "bg-[#ececeb]", ring: "ring-[#dcdcda]", icon: "text-[#7b8290]", title: "text-[#5b6270]" },
  { bg: "bg-[#faf1d6]", ring: "ring-[#eee0b4]", icon: "text-[#c6a02e]", title: "text-[#9c7d1e]" },
] as const;

// Subject line-art mirroring the reference cards:
// microscope, globe, ruler, laptop, paint brush, notebook.
const cardIcons: LucideIcon[] = [Microscope, Globe, PencilRuler, Laptop, Paintbrush, NotebookPen];

const bandLabels: Record<string, string> = {
  support: "Apoyo",
  core: "Base",
  challenge: "Reto",
};

type ActivityStatus = "idle" | "submitted" | "completed";
type StudentRouteSection = "asignaciones" | "progreso";

function getStudentRouteSection(pathname: string): StudentRouteSection {
  return pathname.endsWith("/progreso") ? "progreso" : "asignaciones";
}

export function StudentDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const classes = useClassStore((state) => state.classes);
  const submitArtefacto = useClassStore((state) => state.submitArtefacto);

  const [selectedArtefactoId, setSelectedArtefactoId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [hintCount, setHintCount] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [status, setStatus] = useState<ActivityStatus>("idle");
  const [feedback, setFeedback] = useState<string>("");

  useEffect(() => {
    if (!user || user.role !== "student") {
      navigate("/", { replace: true });
    }
  }, [navigate, user]);

  const studentName = user?.studentName?.trim() || "Estudiante";
  const classCode = user?.classCode?.trim() || "KOBI7";
  const activeSection = getStudentRouteSection(location.pathname);

  const allArtefactos = useClassStore((state) => state.artefactos);
  const submissions = useClassStore((state) => state.submissions);

  const studentClass = useMemo(() => findClassByCode(classes, classCode), [classes, classCode]);
  const artefactos = useMemo(
    () => (studentClass ? selectClassArtefactos({ artefactos: allArtefactos }, studentClass.id) : []),
    [allArtefactos, studentClass],
  );

  const activeArtefacto = useMemo(
    () => artefactos.find((item) => item.id === selectedArtefactoId) ?? artefactos[0],
    [artefactos, selectedArtefactoId],
  );

  const visibleArtefactos = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return artefactos;
    return artefactos.filter((item) => item.title.toLowerCase().includes(query));
  }, [artefactos, searchQuery]);

  const completedCount = useMemo(
    () =>
      artefactos.filter((item) =>
        submissions.some(
          (sub) => sub.artefactoId === item.id && sub.studentName === studentName && sub.status === "completed",
        ),
      ).length,
    [artefactos, submissions, studentName],
  );
  const progressPct = artefactos.length ? Math.round((completedCount / artefactos.length) * 100) : 0;

  const progressLabel = useMemo(() => {
    if (status === "completed") return "Actividad completada";
    if (status === "submitted") return "Respuesta enviada";
    return "Actividad en curso";
  }, [status]);

  function handleLogout() {
    logout();
    navigate("/");
  }

  function resetActivityState() {
    setSelectedAnswer(null);
    setHintCount(0);
    setAttempts(0);
    setStatus("idle");
    setFeedback("");
  }

  function handleSelectArtefacto(id: string) {
    if (id === activeArtefacto?.id) return;
    setSelectedArtefactoId(id);
    resetActivityState();
  }

  function handleRevealHint() {
    if (activeArtefacto && hintCount < activeArtefacto.hints.length) {
      setHintCount((current) => current + 1);
    }
  }

  function handleSubmit() {
    if (!activeArtefacto) return;

    if (!selectedAnswer) {
      setFeedback("Selecciona una respuesta antes de entregar.");
      return;
    }

    const nextAttempts = attempts + 1;
    const isCorrect = selectedAnswer === activeArtefacto.correctAnswer;

    setAttempts(nextAttempts);
    setStatus(isCorrect ? "completed" : "submitted");
    setFeedback(
      isCorrect ? "Correcto. Has terminado la actividad." : "Todavia no. Revisa la pista y prueba otra vez.",
    );

    submitArtefacto({
      artefactoId: activeArtefacto.id,
      classId: activeArtefacto.classId,
      studentName,
      selectedAnswer,
      isCorrect,
      attempts: nextAttempts,
      hintsUsed: hintCount,
    });
  }

  function handleReset() {
    resetActivityState();
  }

  return (
    <main className="min-h-screen bg-[#faf8f4] text-[#2b2b2b]">
      <div className="grid min-h-screen w-full lg:grid-cols-[6.5rem_minmax(0,1fr)]">
        <div className="min-h-screen">
          <StudentSidebar
            className="sticky top-0"
            classCode={classCode}
            navItems={studentNavItems}
            onLogout={handleLogout}
            progressLabel={progressLabel}
            studentName={studentName}
          />
        </div>

        <div className="grid content-start gap-8 px-5 py-8 sm:px-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
          {/* Center column */}
          <div className="min-w-0">
            <header>
              <h1 className="text-4xl font-bold tracking-tight text-[#2b2b2b]">
                {activeSection === "progreso" ? "Progreso" : `Hola, ${studentName},`}
              </h1>
              <p className="mt-2 text-base text-[#8a8f98]">
                {activeSection === "progreso"
                  ? "Revisa tu avance en las actividades de la clase."
                  : "Encontremos la actividad perfecta para ti hoy."}
              </p>
            </header>

            {activeSection === "asignaciones" ? (
              <>
                <label className="mt-6 flex items-center gap-3 rounded-2xl bg-white px-5 py-3.5 shadow-[0_8px_30px_rgba(43,43,43,0.05)]">
                  <Search className="h-5 w-5 text-[#b7bcc4]" strokeWidth={1.75} />
                  <input
                    className="w-full bg-transparent text-sm text-[#2b2b2b] outline-none placeholder:text-[#b7bcc4]"
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Buscar actividad..."
                    type="text"
                    value={searchQuery}
                  />
                </label>

                {visibleArtefactos.length > 0 ? (
                  <div className="mt-6 grid gap-5 sm:grid-cols-2">
                    {visibleArtefactos.map((artefacto) => {
                      const index = artefactos.findIndex((item) => item.id === artefacto.id);
                      const palette = cardStyles[index % cardStyles.length];
                      const Icon = cardIcons[index % cardIcons.length];
                      const isActive = artefacto.id === activeArtefacto?.id;
                      const isDone = submissions.some(
                        (sub) =>
                          sub.artefactoId === artefacto.id &&
                          sub.studentName === studentName &&
                          sub.status === "completed",
                      );

                      return (
                        <button
                          className={`group relative overflow-hidden rounded-3xl ${palette.bg} p-6 text-left transition ${
                            isActive ? `ring-2 ${palette.ring} ring-offset-2 ring-offset-[#faf8f4]` : ""
                          } hover:-translate-y-0.5 hover:shadow-[0_12px_36px_rgba(43,43,43,0.08)]`}
                          key={artefacto.id}
                          onClick={() => handleSelectArtefacto(artefacto.id)}
                          type="button"
                        >
                          <Icon
                            className={`pointer-events-none absolute -right-3 top-1/2 h-28 w-28 -translate-y-1/2 ${palette.icon} opacity-30`}
                            strokeWidth={1.25}
                          />
                          <div className="relative">
                            <div className="flex items-center gap-2">
                              <h3 className={`text-xl font-bold ${palette.title}`}>{artefacto.title}</h3>
                              {isDone ? <CheckCircle2 className={`h-5 w-5 ${palette.icon}`} /> : null}
                            </div>
                            <dl className="mt-3 space-y-1 text-sm text-[#7c8189]">
                              <div>Banda: {bandLabels[artefacto.band] ?? artefacto.band}</div>
                              <div>Objetivo: {artefacto.objective}</div>
                              <div>Entrega: {artefacto.due}</div>
                            </dl>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-6 rounded-3xl border border-dashed border-[#e0ddd5] bg-white/60 p-8 text-center text-sm text-[#8a8f98]">
                    {artefactos.length === 0
                      ? "No tienes actividades asignadas todavía. Tu profesor las publicará aquí."
                      : "Ninguna actividad coincide con tu búsqueda."}
                  </div>
                )}

                {activeArtefacto ? (
                  <section className="mt-6 rounded-3xl bg-white p-6 shadow-[0_8px_30px_rgba(43,43,43,0.05)]">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-[#2f9e8f]">Actividad</p>
                        <h2 className="mt-1 text-xl font-bold text-[#2b2b2b]">{activeArtefacto.title}</h2>
                      </div>
                      <span className="rounded-full bg-[#f0ede7] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#7c8189]">
                        {bandLabels[activeArtefacto.band] ?? activeArtefacto.band}
                      </span>
                    </div>

                    <div className="mt-5 rounded-2xl bg-[#faf8f4] p-5">
                      <p className="text-sm font-medium text-[#8a8f98]">Pregunta 1</p>
                      <p className="mt-2 text-2xl leading-snug text-[#2b2b2b]">{activeArtefacto.prompt}</p>

                      <div className="mt-5 grid gap-3 sm:grid-cols-3">
                        {activeArtefacto.options.map((option) => {
                          const isSelected = selectedAnswer === option;

                          return (
                            <button
                              className={`rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                                isSelected
                                  ? "border-[#2f9e8f] bg-[#2f9e8f] text-white shadow-sm"
                                  : "border-[#e5e2da] bg-white text-[#5b6270] hover:border-[#bfe2d9] hover:bg-[#eef7f4]"
                              }`}
                              key={option}
                              onClick={() => setSelectedAnswer(option)}
                              type="button"
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-5 flex flex-wrap items-center gap-3">
                        <Button className="bg-[#2f9e8f] hover:bg-[#278577]" onClick={handleSubmit} type="button">
                          Entregar respuesta
                        </Button>
                        <Button onClick={handleRevealHint} type="button" variant="secondary">
                          <HelpCircle className="mr-2 h-4 w-4" />
                          Pista
                        </Button>
                        <button
                          className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-[#2f9e8f] transition hover:bg-[#eef7f4]"
                          onClick={handleReset}
                          type="button"
                        >
                          <RotateCcw className="mr-2 h-4 w-4" />
                          Reiniciar
                        </button>
                      </div>

                      {feedback ? (
                        <div className="mt-5 rounded-2xl border border-[#cfe8e1] bg-[#eef7f4] px-4 py-3 text-sm text-[#5b6270]">
                          {feedback}
                        </div>
                      ) : null}

                      {status === "completed" ? (
                        <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
                          <div className="flex items-center gap-2 font-semibold">
                            <CheckCircle2 className="h-4 w-4" />
                            Respuesta correcta
                          </div>
                          <p className="mt-2">
                            Entregaste la actividad con {attempts || 1} intento{(attempts || 1) === 1 ? "" : "s"} y {hintCount} pista
                            {hintCount === 1 ? "" : "s"}.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </section>
                ) : null}
              </>
            ) : (
              <ProgressPanel
                artefactos={artefactos}
                attempts={attempts}
                completedCount={completedCount}
                hintCount={hintCount}
                progressLabel={progressLabel}
                studentName={studentName}
                submissions={submissions}
              />
            )}
          </div>

          {/* Right rail */}
          <aside className="hidden flex-col gap-6 xl:flex">
            <div className="rounded-3xl bg-white p-5 shadow-[0_8px_30px_rgba(43,43,43,0.05)]">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e3f3ee] text-[#2f9e8f]">
                  <GraduationCap className="h-8 w-8" strokeWidth={1.75} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold text-[#2b2b2b]">{studentName}</p>
                  <p className="text-sm text-[#8a8f98]">Estudiante</p>
                </div>
              </div>
              <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-[#eceae4]">
                <div className="h-full rounded-full bg-[#2f9e8f] transition-all" style={{ width: `${progressPct}%` }} />
              </div>
              <p className="mt-2 text-xs font-medium text-[#8a8f98]">
                Reporte de avance · {completedCount}/{artefactos.length} completadas
              </p>
            </div>

            <div>
              <h2 className="text-xl font-bold text-[#2f9e8f]">
                {activeArtefacto ? activeArtefacto.title : "Actividad"}
              </h2>
              <p className="text-sm text-[#8a8f98]">Pasos y pistas</p>

              <ol className="mt-4 space-y-4">
                {activeArtefacto && activeArtefacto.hints.length > 0 ? (
                  activeArtefacto.hints.map((hint, index) => {
                    const revealed = index < hintCount;

                    return (
                      <li className="flex items-start gap-4" key={hint}>
                        <span className="w-9 shrink-0 text-3xl font-bold leading-none text-[#cfe8e1]">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-semibold ${revealed ? "text-[#2b2b2b]" : "text-[#b7bcc4]"}`}>
                            {revealed ? hint : `Pista ${index + 1}`}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1 text-xs">
                            {revealed ? (
                              <>
                                <Target className="h-3 w-3 text-[#2f9e8f]" />
                                <span className="text-[#8a8f98]">Pista revelada</span>
                              </>
                            ) : (
                              <>
                                <Lock className="h-3 w-3 text-[#c2c6cd]" />
                                <span className="text-[#b7bcc4]">Usa el botón Pista</span>
                              </>
                            )}
                          </p>
                        </div>
                      </li>
                    );
                  })
                ) : (
                  <li className="flex items-start gap-4">
                    <span className="w-9 shrink-0 text-3xl font-bold leading-none text-[#cfe8e1]">01</span>
                    <p className="pt-1 text-sm text-[#8a8f98]">Selecciona una actividad para ver sus pasos.</p>
                  </li>
                )}
              </ol>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

interface ProgressPanelProps {
  artefactos: ReturnType<typeof selectClassArtefactos>;
  submissions: ReturnType<typeof useClassStore.getState>["submissions"];
  studentName: string;
  completedCount: number;
  attempts: number;
  hintCount: number;
  progressLabel: string;
}

function ProgressPanel({
  artefactos,
  submissions,
  studentName,
  completedCount,
  attempts,
  hintCount,
  progressLabel,
}: ProgressPanelProps) {
  const stats = [
    { label: "Completadas", value: `${completedCount}/${artefactos.length}`, icon: CheckCircle2 },
    { label: "Intentos", value: `${attempts}`, icon: Target },
    { label: "Pistas", value: `${hintCount}`, icon: HelpCircle },
    { label: "Estado", value: progressLabel, icon: Clock },
  ];

  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-3xl bg-white p-5 shadow-[0_8px_30px_rgba(43,43,43,0.05)]">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e3f3ee] text-[#2f9e8f]">
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm font-medium text-[#8a8f98]">{item.label}</p>
              <p className="mt-1 text-lg font-bold text-[#2b2b2b]">{item.value}</p>
            </div>
          );
        })}
      </div>

      <div className="rounded-3xl bg-white p-6 shadow-[0_8px_30px_rgba(43,43,43,0.05)]">
        <h2 className="text-lg font-bold text-[#2b2b2b]">Tus actividades</h2>
        <ul className="mt-4 divide-y divide-[#f0ede7]">
          {artefactos.map((artefacto) => {
            const submission = submissions.find(
              (sub) => sub.artefactoId === artefacto.id && sub.studentName === studentName,
            );
            const state =
              submission?.status === "completed"
                ? "Listo"
                : submission?.status === "submitted"
                  ? "En curso"
                  : "Pendiente";

            return (
              <li className="flex items-center justify-between gap-4 py-3" key={artefacto.id}>
                <div>
                  <p className="text-sm font-semibold text-[#2b2b2b]">{artefacto.title}</p>
                  <p className="text-xs text-[#8a8f98]">Objetivo {artefacto.objective}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    state === "Listo"
                      ? "bg-emerald-50 text-emerald-700"
                      : state === "En curso"
                        ? "bg-[#e3f3ee] text-[#2f9e8f]"
                        : "bg-[#f0ede7] text-[#7c8189]"
                  }`}
                >
                  {state}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
