import { useEffect, useMemo, useRef, useState } from "react";
import { PlayCircle, ShieldCheck } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { ACTIVITY_SDK_VERSION, activitySdkMessageSchema } from "@kobi/activities";
import {
  findClassByCode,
  selectClassArtefactos,
  useAuthStore,
  useClassStore,
  type Artefacto,
  type ArtefactoSubmission,
} from "../../lib/store";
import { supabase } from "../../lib/supabase";
import {
  handleStudentActivityMessage,
  SupabaseActivityDeliveryStore,
  type StudentAssignment,
} from "../activityDelivery/artifactDelivery";
import { StudentSidebar, type StudentSidebarNavItem } from "./components/StudentSidebar";
import { LessonList } from "./components/LessonList";
import { ArtifactRenderer } from "./components/ArtifactRenderer";
import { ProgressDashboard } from "./components/ProgressDashboard";
import { StudentHelpModal } from "./components/StudentHelpModal";

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

type StudentRouteSection = "asignaciones" | "progreso";

function getStudentRouteSection(pathname: string): StudentRouteSection {
  return pathname.endsWith("/progreso") ? "progreso" : "asignaciones";
}

const bandLabels = {
  support: "Apoyo",
  core: "Base",
  challenge: "Reto",
} as const;

function artefactoFromAssignment(assignment: StudentAssignment, classId: string): Artefacto {
  return {
    id: assignment.id,
    classId,
    title: assignment.manifest.title,
    section: assignment.manifest.curriculum.unit,
    objective: assignment.manifest.curriculum.objective,
    band: assignment.variant,
    kind: "quiz",
    estimateLabel: `${assignment.manifest.est_minutes} min · ${bandLabels[assignment.variant]}`,
    content: {
      type: "quiz",
      questions: assignment.manifest.content.items.map((item, index) => ({
        id: `item-${index + 1}`,
        prompt: item.prompt,
        choices: item.answer_key.map((answer, answerIndex) => ({
          id: `answer-${answerIndex + 1}`,
          label: answer,
        })),
        correctChoiceId: "answer-1",
        hints: item.hints,
      })),
    },
    status: "assigned",
    due: "Hoy",
    createdAt: 0,
  };
}

export function StudentDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const classes = useClassStore((state) => state.classes);
  const allArtefactos = useClassStore((state) => state.artefactos);
  const submissions = useClassStore((state) => state.submissions);

  const [assignment, setAssignment] = useState<StudentAssignment | null>(null);
  const [loadingAssignment, setLoadingAssignment] = useState(true);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [telemetryStatus, setTelemetryStatus] = useState<string | null>(null);
  const [selectedArtefactoId, setSelectedArtefactoId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const eventsInWindowRef = useRef(0);

  useEffect(() => {
    if (!user || user.role !== "student") {
      navigate("/", { replace: true });
    }
  }, [navigate, user]);

  const studentName = user?.studentName?.trim() || "Estudiante";
  const classCode = user?.joinCode?.trim() || "KOBI7";
  const classId = user?.classId ?? "class-1";
  const studentId = user?.studentId;
  const activeSection = getStudentRouteSection(location.pathname);
  const deliveryStore = useMemo(
    () => (supabase ? new SupabaseActivityDeliveryStore(supabase) : null),
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadAssignment() {
      if (!studentId || !deliveryStore) {
        setLoadingAssignment(false);
        setAssignment(null);
        return;
      }

      setLoadingAssignment(true);
      setAssignmentError(null);

      try {
        const loaded = await deliveryStore.loadLatestAssignmentForStudent(studentId);
        if (!cancelled) setAssignment(loaded);
      } catch (error) {
        if (!cancelled) {
          setAssignmentError(error instanceof Error ? error.message : "No se pudo cargar la actividad.");
        }
      } finally {
        if (!cancelled) setLoadingAssignment(false);
      }
    }

    void loadAssignment();
    const id = window.setInterval(loadAssignment, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [deliveryStore, studentId]);

  useEffect(() => {
    if (!assignment || !deliveryStore) return;
    const currentAssignment = assignment;
    const currentStore = deliveryStore;
    eventsInWindowRef.current = 0;

    function handleMessage(event: MessageEvent) {
      const sourceMatches = event.source === iframeRef.current?.contentWindow;
      const parsed = activitySdkMessageSchema.safeParse(event.data);

      if (sourceMatches && parsed.success && parsed.data.type === "request") {
        const result = parsed.data.method === "getManifest" ? currentAssignment.manifest : currentAssignment.variant;
        iframeRef.current?.contentWindow?.postMessage(
          {
            sdk: ACTIVITY_SDK_VERSION,
            type: "response",
            id: parsed.data.id,
            ok: true,
            result,
          },
          "*",
        );
        return;
      }

      void handleStudentActivityMessage({
        store: currentStore,
        assignment: currentAssignment,
        message: event.data,
        sourceMatches,
        eventsInRateWindow: eventsInWindowRef.current,
      }).then((result) => {
        if (!result.ok) return;
        eventsInWindowRef.current += 1;
        setTelemetryStatus(result.event.type === "complete" ? "Actividad completada." : "Progreso guardado.");
      });
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [assignment, deliveryStore]);

  const studentClass = useMemo(
    () => classes.find((item) => item.id === classId) ?? findClassByCode(classes, classCode),
    [classCode, classId, classes],
  );
  const deliveredArtefacto = useMemo(
    () => (assignment ? artefactoFromAssignment(assignment, classId) : null),
    [assignment, classId],
  );
  const localArtefactos = useMemo(
    () => (studentClass ? selectClassArtefactos({ artefactos: allArtefactos }, studentClass.id) : []),
    [allArtefactos, studentClass],
  );
  const artefactos = useMemo(
    () => (deliveredArtefacto ? [deliveredArtefacto] : localArtefactos),
    [deliveredArtefacto, localArtefactos],
  );

  const assignmentSubmissions = useMemo<ArtefactoSubmission[]>(() => {
    if (!deliveredArtefacto || assignment?.status !== "completed") return [];

    return [
      {
        id: `assignment-submission-${assignment.id}`,
        artefactoId: deliveredArtefacto.id,
        classId: deliveredArtefacto.classId,
        studentName,
        answers: [],
        score: 1,
        total: 1,
        attempts: 1,
        hintsUsed: 0,
        status: "completed",
        submittedAt: 0,
      },
    ];
  }, [assignment, deliveredArtefacto, studentName]);

  const displaySubmissions = deliveredArtefacto ? assignmentSubmissions : submissions;

  const activeArtefacto = useMemo(
    () => artefactos.find((item) => item.id === selectedArtefactoId) ?? artefactos[0],
    [artefactos, selectedArtefactoId],
  );

  const completedCount = useMemo(
    () =>
      artefactos.filter((item) =>
        displaySubmissions.some(
          (sub) => sub.artefactoId === item.id && sub.studentName === studentName && sub.status === "completed",
        ),
      ).length,
    [artefactos, displaySubmissions, studentName],
  );

  function handleLogout() {
    logout();
    navigate("/");
  }

  const progressSummary =
    completedCount === artefactos.length && artefactos.length > 0
      ? "Todo completado"
      : completedCount > 0
        ? "En progreso"
        : "Sin iniciar";

  return (
    <main className="min-h-screen bg-[#faf8f4] text-[#2b2b2b]">
      <div className="grid min-h-screen w-full lg:grid-cols-[6.5rem_minmax(0,1fr)]">
        <div className="min-h-screen">
          <StudentSidebar
            className="sticky top-0"
            classCode={classCode}
            navItems={studentNavItems}
            onHelp={() => setHelpOpen(true)}
            onLogout={handleLogout}
            progressLabel={progressSummary}
            studentName={studentName}
          />
        </div>

        {activeSection === "asignaciones" ? (
          <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[20rem_minmax(0,1fr)]">
            <div className="border-b border-[#ece8e1] bg-[#fdfcf9] px-6 py-8 lg:border-b-0 lg:border-r">
              <LessonList
                activeId={activeArtefacto?.id}
                artefactos={artefactos}
                onSelect={setSelectedArtefactoId}
                section={studentClass?.focus ?? activeArtefacto?.section ?? "Actividades"}
                studentName={studentName}
                submissions={displaySubmissions}
                title={studentClass?.title ?? user?.className ?? "Tu clase"}
              />
            </div>

            <div className="px-6 py-10 sm:px-10">
              {loadingAssignment && deliveryStore ? (
                <div className="mx-auto max-w-2xl rounded-3xl bg-white/70 p-10 text-center shadow-sm">
                  <h2 className="text-xl font-semibold text-[#2b2b2b]">Buscando actividad...</h2>
                  <p className="mt-2 text-sm text-[#8a8f98]">Kobi revisa si tu docente ya publicó una actividad.</p>
                </div>
              ) : assignment && activeArtefacto?.id === assignment.id ? (
                <section className="mx-auto max-w-4xl rounded-3xl bg-white p-6 shadow-[0_8px_30px_rgba(43,43,43,0.05)]">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-[#5b5bd6]">Actividad lista</p>
                      <h2 className="mt-1 text-2xl font-bold text-[#2b2b2b]">{assignment.manifest.title}</h2>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#8a8f98]">
                        Variante {bandLabels[assignment.variant]}. Tu progreso se guarda automáticamente.
                      </p>
                    </div>
                    {telemetryStatus ? (
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700">
                        {telemetryStatus}
                      </span>
                    ) : null}
                  </div>
                  <iframe
                    className="h-[620px] w-full rounded-2xl border border-[#ece9e2] bg-white"
                    ref={iframeRef}
                    sandbox="allow-scripts"
                    srcDoc={assignment.bundleHtml}
                    title={assignment.manifest.title}
                  />
                </section>
              ) : activeArtefacto ? (
                <ArtifactRenderer
                  key={activeArtefacto.id}
                  artefacto={activeArtefacto}
                  onHome={() => setSelectedArtefactoId(artefactos[0]?.id ?? null)}
                  studentName={studentName}
                />
              ) : (
                <div className="mx-auto max-w-2xl rounded-3xl border border-dashed border-[#e0ddd5] bg-white/60 p-10 text-center text-sm text-[#8a8f98]">
                  No tienes actividades asignadas todavía. Tu profesor las publicará aquí.
                </div>
              )}
              {assignmentError ? <p className="mx-auto mt-4 max-w-2xl text-sm font-bold text-red-600">{assignmentError}</p> : null}
            </div>
          </div>
        ) : (
          <div className="grid content-start gap-6 px-5 py-8 sm:px-8">
            <header>
              <h1 className="text-4xl font-bold tracking-tight text-[#2b2b2b]">Progreso</h1>
              <p className="mt-2 text-base text-[#8a8f98]">Revisa tu avance en las actividades de la clase.</p>
            </header>
            <ProgressDashboard artefactos={artefactos} studentName={studentName} submissions={displaySubmissions} />
          </div>
        )}
      </div>

      <StudentHelpModal classCode={classCode} onClose={() => setHelpOpen(false)} open={helpOpen} />
    </main>
  );
}
