import { useEffect, useMemo, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ACTIVITY_SDK_VERSION, activitySdkMessageSchema } from "@kobi/activities";
import { Button } from "../../components/ui/button";
import { useAuthStore } from "../../lib/store";
import { supabase } from "../../lib/supabase";
import {
  handleStudentActivityMessage,
  SupabaseActivityDeliveryStore,
  type StudentAssignment,
} from "../activityDelivery/artifactDelivery";

export function StudentDashboard() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [assignment, setAssignment] = useState<StudentAssignment | null>(null);
  const [loadingAssignment, setLoadingAssignment] = useState(true);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [telemetryStatus, setTelemetryStatus] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const eventsInWindowRef = useRef(0);

  const studentName = user?.studentName || "Ana";
  const className = user?.className ?? "Clase Kobi";
  const joinCode = user?.joinCode;
  const studentId = user?.studentId;
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

  function handleLogout() {
    logout();
    navigate("/");
  }

  return (
    <main className="min-h-screen bg-[#eef5fb] px-6 py-8 text-foreground">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-primary">Panel estudiante</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal text-[#0f4f9e]">Hola, {studentName}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {className}
              {joinCode ? <span className="ml-2 font-semibold text-[#1077e5]">Codigo {joinCode}</span> : null}
            </p>
          </div>
          <Button onClick={handleLogout} type="button" variant="secondary">
            <LogOut className="mr-2 h-4 w-4" />
            Salir
          </Button>
        </header>

        <section className="rounded-xl bg-white p-6 shadow-sm">
          {loadingAssignment ? (
            <div className="py-12 text-center">
              <h2 className="text-xl font-semibold text-[#0f4f9e]">Buscando actividad...</h2>
              <p className="mt-2 text-sm text-muted-foreground">Kobi revisa si tu docente ya publico una actividad.</p>
            </div>
          ) : assignment ? (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-primary">Actividad lista</p>
                  <h2 className="mt-1 text-xl font-semibold text-[#0f4f9e]">{assignment.manifest.title}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                    Variante {assignment.variant}. Tu progreso se guarda automaticamente.
                  </p>
                </div>
                {telemetryStatus ? (
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700">
                    {telemetryStatus}
                  </span>
                ) : null}
              </div>
              <iframe
                className="h-[620px] w-full rounded-xl border border-slate-200 bg-white"
                ref={iframeRef}
                sandbox="allow-scripts"
                srcDoc={assignment.bundleHtml}
                title={assignment.manifest.title}
              />
            </>
          ) : (
            <div className="py-12 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 text-[#1077e5]">
                <svg
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-[#0f4f9e]">Esperando actividad</h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Mantente en esta pantalla. La actividad aparecera cuando tu docente la publique.
              </p>
              {assignmentError ? <p className="mt-4 text-sm font-bold text-red-600">{assignmentError}</p> : null}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
