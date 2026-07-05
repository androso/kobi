import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, HelpCircle, PlayCircle, RotateCcw, Sparkles, ShieldCheck } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import {
  findClassByCode,
  selectClassArtefactos,
  selectSubmission,
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
  const activeArtefacto = artefactos[0];

  const progressLabel = useMemo(() => {
    if (status === "completed") return "Actividad completada";
    if (status === "submitted") return "Respuesta enviada";
    return "Actividad en curso";
  }, [status]);

  function handleLogout() {
    logout();
    navigate("/");
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
    setSelectedAnswer(null);
    setHintCount(0);
    setAttempts(0);
    setStatus("idle");
    setFeedback("");
  }

  return (
    <main className="min-h-screen bg-[#eef5fb] text-foreground">
      <div className="grid min-h-screen w-full lg:grid-cols-[7.5rem_minmax(0,1fr)]">
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

        <div className="grid content-start gap-6 px-4 py-6 sm:px-6 sm:py-8">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-primary">Panel estudiante</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-normal text-[#0f4f9e]">
                {activeSection === "progreso" ? "Progreso" : "Asignaciones y Artefactos"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Navega entre tus secciones y sigue el avance de la actividad.
              </p>
            </div>
            <div className="rounded-full border border-sky-100 bg-white px-4 py-2 text-sm font-medium text-[#0f4f9e] shadow-sm">
              {progressLabel}
            </div>
          </header>

          {activeSection === "asignaciones" ? (
            <section className="rounded-[1.75rem] bg-white p-6 shadow-sm">
              {activeArtefacto ? (
                <>
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-[#1077e5]">
                        <Sparkles className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-500">Actividad lista</p>
                        <h2 className="text-xl font-semibold text-[#0f4f9e]">{activeArtefacto.title}</h2>
                      </div>
                    </div>
                    <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {activeArtefacto.band}
                    </div>
                  </div>

                  <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                    Lee la oracion, elige la palabra que completa mejor el sentido y entrega tu respuesta cuando estes listo.
                  </p>

                  <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50/70 p-5">
                    <p className="text-sm font-medium text-slate-500">Pregunta 1</p>
                    <p className="mt-3 text-2xl leading-snug text-[#0f4f9e]">{activeArtefacto.prompt}</p>

                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                      {activeArtefacto.options.map((option) => {
                        const isSelected = selectedAnswer === option;

                        return (
                          <button
                            className={`rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                              isSelected
                                ? "border-[#1077e5] bg-[#1077e5] text-white shadow-sm"
                                : "border-slate-200 bg-white text-slate-700 hover:border-sky-200 hover:bg-sky-50"
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
                      <Button onClick={handleSubmit} type="button">
                        Entregar respuesta
                      </Button>
                      <Button onClick={handleRevealHint} type="button" variant="secondary">
                        <HelpCircle className="mr-2 h-4 w-4" />
                        Pista
                      </Button>
                      <button
                        className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-[#1077e5] transition hover:bg-sky-50"
                        onClick={handleReset}
                        type="button"
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Reiniciar
                      </button>
                    </div>

                    {hintCount > 0 ? (
                      <ul className="mt-5 space-y-2">
                        {activeArtefacto.hints.slice(0, hintCount).map((hint) => (
                          <li
                            className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900"
                            key={hint}
                          >
                            {hint}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {feedback ? (
                      <div className="mt-5 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-slate-700">{feedback}</div>
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
                </>
              ) : (
                <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center text-sm text-slate-500">
                  No tienes actividades asignadas todavía. Tu profesor las publicará aquí.
                </div>
              )}

              {artefactos.length > 0 ? (
                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  {artefactos.map((assignment) => {
                    const submission = submissions.find(
                      (item) => item.artefactoId === assignment.id && item.studentName === studentName,
                    );
                    const assignmentStatus =
                      submission?.status === "completed"
                        ? "Listo"
                        : submission?.status === "submitted"
                          ? "En curso"
                          : "Pendiente";

                    return (
                      <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5" key={assignment.id}>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium text-slate-500">{assignment.band}</p>
                            <h3 className="mt-1 text-lg font-semibold text-[#0f4f9e]">{assignment.title}</h3>
                          </div>
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500">
                            {assignmentStatus}
                          </span>
                        </div>
                        <p className="mt-3 text-sm text-slate-600">Entrega {assignment.due}.</p>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </section>
          ) : (
            <section className="rounded-[1.75rem] bg-white p-6 shadow-sm">
              <div className="grid gap-4 md:grid-cols-3">
                {[
                  { label: "Intentos", value: `${attempts}` },
                  { label: "Pistas", value: `${hintCount}` },
                  { label: "Estado", value: progressLabel },
                ].map((item) => (
                  <div key={item.label} className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5">
                    <p className="text-sm font-medium text-slate-500">{item.label}</p>
                    <p className="mt-2 text-lg font-semibold text-[#0f4f9e]">{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50/70 p-5 text-sm leading-6 text-slate-700">
                Usa las pistas del panel lateral para resolver la actividad paso a paso. El objetivo y la sección del libro
                te ayudan a confirmar que estás trabajando la evidencia correcta.
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
