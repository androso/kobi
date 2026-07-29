import { useEffect, useMemo, useRef, useState } from "react";
import { Clock3, PlayCircle, ShieldCheck, Sparkles } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  findClassByCode,
  useAuthStore,
  useClassStore,
  type Artefacto,
} from "../../lib/store";
import { supabase } from "../../lib/supabase";
import {
  handleStudentActivityMessage,
  SupabaseActivityDeliveryStore,
  type StudentAssignment,
} from "../activityDelivery/artifactDelivery";
import {
  activityIframeSecurityAttributes,
  secureActivitySrcDoc,
} from "../activityDelivery/activityIframeSecurity";
import {
  isActivitySdkTelemetryFromIframe,
  markActivityIframeAwaitingSource,
  respondToActivitySdkRequest,
} from "../activityDelivery/activitySdkHost";
import { StudentSidebar, type StudentSidebarNavItem } from "./components/StudentSidebar";
import { LessonList } from "./components/LessonList";
import { ProgressDashboard } from "./components/ProgressDashboard";
import { StudentHelpModal } from "./components/StudentHelpModal";
import { KobiMascot, PortalCard } from "../../components/portal/PortalChrome";

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
    kind: "verified_bundle",
    estimateLabel: `${assignment.manifest.est_minutes} min · ${bandLabels[assignment.variant]}`,
    content: {
      type: "verified_bundle",
      family: assignment.manifest.family,
    },
    status: "assigned",
    due: "Hoy",
    createdAt: 0,
  };
}

function sameAssignment(left: StudentAssignment | null, right: StudentAssignment | null) {
  if (!left || !right) return left === right;

  return (
    left.id === right.id &&
    left.activityId === right.activityId &&
    left.status === right.status &&
    left.variant === right.variant &&
    left.bundleHtml === right.bundleHtml
  );
}

export function StudentDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const classes = useClassStore((state) => state.classes);

  const [assignment, setAssignment] = useState<StudentAssignment | null>(null);
  const [loadingAssignment, setLoadingAssignment] = useState(true);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [telemetryStatus, setTelemetryStatus] = useState<string | null>(null);
  const [selectedArtefactoId, setSelectedArtefactoId] = useState<string | null>(null);
  const [dismissingAssignment, setDismissingAssignment] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const eventsInWindowRef = useRef(0);
  const pendingDismissalsRef = useRef(new Set<string>());

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
    () => supabase ? new SupabaseActivityDeliveryStore(supabase) : null,
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadAssignment(isInitialLoad = false) {
      if (!studentId || !deliveryStore) {
        setLoadingAssignment(false);
        setAssignment(null);
        return;
      }

      if (isInitialLoad) {
        setLoadingAssignment(true);
        setAssignmentError(null);
      }

      try {
        const loaded = await deliveryStore.loadLatestAssignmentForStudent(studentId);
        if (!cancelled) {
          const visibleAssignment = loaded && pendingDismissalsRef.current.has(loaded.id) ? null : loaded;
          setAssignment((current) => (sameAssignment(current, visibleAssignment) ? current : visibleAssignment));
          setAssignmentError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setAssignmentError(error instanceof Error ? error.message : "No se pudo cargar la actividad.");
        }
      } finally {
        if (!cancelled && isInitialLoad) setLoadingAssignment(false);
      }
    }

    void loadAssignment(true);
    const id = window.setInterval(() => void loadAssignment(), 5000);
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

    const activeIframe = iframeRef.current;
    if (!activeIframe) return;
    markActivityIframeAwaitingSource(activeIframe);

    function handleMessage(event: MessageEvent) {
      if (!activeIframe) return;
      const sourceMatches = isActivitySdkTelemetryFromIframe(event, activeIframe);
      if (respondToActivitySdkRequest(event, {
        iframe: activeIframe,
        manifest: currentAssignment.manifest,
        band: currentAssignment.variant,
      })) {
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
  const artefactos = useMemo(
    () => (deliveredArtefacto ? [deliveredArtefacto] : []),
    [deliveredArtefacto],
  );

  const activeArtefacto = useMemo(
    () => artefactos.find((item) => item.id === selectedArtefactoId) ?? artefactos[0],
    [artefactos, selectedArtefactoId],
  );
  const completedIds = useMemo(
    () => (assignment?.status === "completed" ? new Set([assignment.id]) : new Set<string>()),
    [assignment],
  );

  function handleLogout() {
    logout();
    navigate("/");
  }

  async function handleDismissAssignment() {
    if (!assignment || !studentId || !deliveryStore || dismissingAssignment) return;

    const dismissedAssignment = assignment;
    pendingDismissalsRef.current.add(dismissedAssignment.id);
    setDismissingAssignment(true);
    setAssignmentError(null);
    setTelemetryStatus(null);
    setSelectedArtefactoId(null);
    setAssignment(null);

    try {
      await deliveryStore.dismissAssignmentForStudent({
        assignmentId: dismissedAssignment.id,
        studentId,
        dismissedAt: new Date().toISOString(),
      });
    } catch (error) {
      pendingDismissalsRef.current.delete(dismissedAssignment.id);
      setAssignment(dismissedAssignment);
      setSelectedArtefactoId(dismissedAssignment.id);
      setAssignmentError(error instanceof Error ? error.message : "No se pudo quitar la actividad.");
    } finally {
      pendingDismissalsRef.current.delete(dismissedAssignment.id);
      setDismissingAssignment(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#eef5fb] text-slate-950">
      <div className="min-h-screen lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
        <StudentSidebar
          classCode={classCode}
          navItems={studentNavItems}
          onHelp={() => setHelpOpen(true)}
          onLogout={handleLogout}
          studentName={studentName}
        />

        <div className="min-w-0 pb-24 lg:h-screen lg:p-5 lg:pb-5">
          <div className="min-h-[calc(100vh-76px)] overflow-hidden bg-[#f8f9ff] lg:h-full lg:min-h-0 lg:rounded-[30px] lg:border lg:border-slate-200/70 lg:shadow-sm">
            {activeSection === "asignaciones" ? (
              <div className="h-full overflow-y-auto px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
                <header className="mx-auto mb-6 flex max-w-7xl flex-col justify-between gap-5 rounded-[28px] bg-[#004ac6] p-6 text-white shadow-lg shadow-blue-900/10 sm:flex-row sm:items-center lg:p-8">
                  <div className="max-w-2xl">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-200">Tu espacio de aprendizaje</p>
                    <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Hola, {studentName}</h1>
                    <p className="mt-2 text-sm leading-6 text-blue-100 sm:text-base">
                      {assignment
                        ? "Tu docente publicó una actividad. Ábrela cuando estés listo; Kobi guardará tus avances."
                        : "Cuando tu docente publique una actividad, aparecerá aquí lista para comenzar."}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 self-end sm:self-auto">
                    <div className="rounded-2xl bg-white/10 px-4 py-3 text-right backdrop-blur">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-blue-200">Código de clase</p>
                      <p className="mt-1 font-mono text-xl font-black tracking-[0.16em]">{classCode}</p>
                    </div>
                    <div className="kobi-pet-surface flex h-20 w-20 items-center justify-center rounded-[26px] bg-[#fce7db] text-slate-900 shadow-lg shadow-blue-950/20 sm:h-24 sm:w-24">
                      <KobiMascot className="h-14 w-14 sm:h-16 sm:w-16" />
                    </div>
                  </div>
                </header>

                <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
                  <PortalCard className="h-fit p-5 lg:p-6">
                    <LessonList
                      activeId={activeArtefacto?.id}
                      artefactos={artefactos}
                      onDismiss={assignment ? handleDismissAssignment : undefined}
                      onSelect={setSelectedArtefactoId}
                      section={studentClass?.focus ?? activeArtefacto?.section ?? "Actividades"}
                      completedIds={completedIds}
                      title={studentClass?.title ?? user?.className ?? "Tu clase"}
                    />
                  </PortalCard>

                  <div className="min-w-0">
                    {loadingAssignment && deliveryStore && !assignment ? (
                      <PortalCard className="p-10 text-center">
                        <div className="kobi-pet-surface mx-auto flex h-20 w-20 items-center justify-center rounded-[26px] bg-[#fce7db]">
                          <KobiMascot className="h-14 w-14 text-slate-900" />
                        </div>
                        <h2 className="mt-4 text-xl font-bold text-slate-900">Buscando actividad...</h2>
                        <p className="mt-2 text-sm text-slate-500">Kobi revisa si tu docente ya publicó una actividad.</p>
                      </PortalCard>
                    ) : assignment && activeArtefacto?.id === assignment.id ? (
                      <PortalCard className="overflow-hidden">
                        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 p-5 sm:p-6">
                          <div>
                            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#004ac6]">
                              <Sparkles className="h-4 w-4" /> Actividad lista
                            </p>
                            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{assignment.manifest.title}</h2>
                            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                              <span className="flex items-center gap-1.5">
                                <Clock3 className="h-4 w-4" /> {assignment.manifest.est_minutes} min
                              </span>
                              <span>Ruta {bandLabels[assignment.variant]}</span>
                              <span>Tu progreso se guarda automáticamente</span>
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {telemetryStatus ? (
                              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
                                {telemetryStatus}
                              </span>
                            ) : null}
                            <button
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={dismissingAssignment}
                              onClick={handleDismissAssignment}
                              type="button"
                            >
                              {dismissingAssignment ? "Quitando..." : "Quitar de mi lista"}
                            </button>
                          </div>
                        </div>
                        <div className="bg-slate-50 p-3 sm:p-5">
                          <iframe
                            {...activityIframeSecurityAttributes}
                            className="h-[70vh] min-h-[520px] w-full rounded-2xl border border-slate-200 bg-white"
                            ref={iframeRef}
                            srcDoc={secureActivitySrcDoc(assignment.bundleHtml)}
                            title={assignment.manifest.title}
                          />
                        </div>
                      </PortalCard>
                    ) : (
                      <PortalCard className="border-dashed p-10 text-center">
                        <div className="kobi-pet-surface mx-auto flex h-20 w-20 items-center justify-center rounded-[26px] bg-[#fce7db]">
                          <KobiMascot className="h-14 w-14 text-slate-900" />
                        </div>
                        <h2 className="mt-5 text-xl font-bold text-slate-900">Todo tranquilo por ahora</h2>
                        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                          No tienes actividades asignadas todavía. Tu docente las publicará aquí.
                        </p>
                      </PortalCard>
                    )}
                    {assignmentError ? (
                      <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{assignmentError}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full overflow-y-auto px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
                <div className="mx-auto max-w-7xl">
                  <header className="mb-6">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#004ac6]">Tu clase</p>
                    <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Progreso</h1>
                    <p className="mt-2 text-base text-slate-500">Revisa las actividades que realmente has completado.</p>
                  </header>
                  <ProgressDashboard artefactos={artefactos} completedIds={completedIds} studentName={studentName} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <StudentHelpModal classCode={classCode} onClose={() => setHelpOpen(false)} open={helpOpen} />
    </main>
  );
}
