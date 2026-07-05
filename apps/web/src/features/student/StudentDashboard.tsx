import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, HelpCircle, PlayCircle, ShieldCheck, Target } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  findClassByCode,
  selectClassArtefactos,
  useAuthStore,
  useClassStore,
  type Artefacto,
  type ArtefactoSubmission,
} from "../../lib/store";
import { StudentSidebar, type StudentSidebarNavItem } from "./components/StudentSidebar";
import { LessonList } from "./components/LessonList";
import { ArtifactRenderer } from "./components/ArtifactRenderer";

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

export function StudentDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const classes = useClassStore((state) => state.classes);
  const allArtefactos = useClassStore((state) => state.artefactos);
  const submissions = useClassStore((state) => state.submissions);

  const [selectedArtefactoId, setSelectedArtefactoId] = useState<string | null>(null);

  useEffect(() => {
    if (!user || user.role !== "student") {
      navigate("/", { replace: true });
    }
  }, [navigate, user]);

  const studentName = user?.studentName?.trim() || "Estudiante";
  const classCode = user?.classCode?.trim() || "KOBI7";
  const activeSection = getStudentRouteSection(location.pathname);

  const studentClass = useMemo(() => findClassByCode(classes, classCode), [classes, classCode]);
  const artefactos = useMemo(
    () => (studentClass ? selectClassArtefactos({ artefactos: allArtefactos }, studentClass.id) : []),
    [allArtefactos, studentClass],
  );

  const activeArtefacto = useMemo(
    () => artefactos.find((item) => item.id === selectedArtefactoId) ?? artefactos[0],
    [artefactos, selectedArtefactoId],
  );

  const completedCount = useMemo(
    () =>
      artefactos.filter((item) =>
        submissions.some(
          (sub) => sub.artefactoId === item.id && sub.studentName === studentName && sub.status === "completed",
        ),
      ).length,
    [artefactos, submissions, studentName],
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
                section={studentClass?.focus ?? "Actividades"}
                studentName={studentName}
                submissions={submissions}
                title={studentClass?.title ?? "Tu clase"}
              />
            </div>

            <div className="px-6 py-10 sm:px-10">
              {activeArtefacto ? (
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
            </div>
          </div>
        ) : (
          <div className="grid content-start gap-6 px-5 py-8 sm:px-8">
            <header>
              <h1 className="text-4xl font-bold tracking-tight text-[#2b2b2b]">Progreso</h1>
              <p className="mt-2 text-base text-[#8a8f98]">Revisa tu avance en las actividades de la clase.</p>
            </header>
            <ProgressPanel
              artefactos={artefactos}
              completedCount={completedCount}
              studentName={studentName}
              submissions={submissions}
            />
          </div>
        )}
      </div>
    </main>
  );
}

interface ProgressPanelProps {
  artefactos: Artefacto[];
  submissions: ArtefactoSubmission[];
  studentName: string;
  completedCount: number;
}

function ProgressPanel({ artefactos, submissions, studentName, completedCount }: ProgressPanelProps) {
  const mySubmissions = submissions.filter((sub) => sub.studentName === studentName);
  const totalAttempts = mySubmissions.reduce((sum, sub) => sum + sub.attempts, 0);
  const totalHints = mySubmissions.reduce((sum, sub) => sum + sub.hintsUsed, 0);

  const stats = [
    { label: "Completadas", value: `${completedCount}/${artefactos.length}`, icon: CheckCircle2 },
    { label: "Intentos", value: `${totalAttempts}`, icon: Target },
    { label: "Pistas", value: `${totalHints}`, icon: HelpCircle },
    {
      label: "Estado",
      value: completedCount === artefactos.length && artefactos.length > 0 ? "Al día" : "En curso",
      icon: Clock,
    },
  ];

  return (
    <div className="space-y-6">
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
            const submission = mySubmissions.find((sub) => sub.artefactoId === artefacto.id);
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
                  <p className="text-xs text-[#8a8f98]">
                    Objetivo {artefacto.objective}
                    {submission ? ` · ${submission.score}/${submission.total}` : ""}
                  </p>
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
