import { CheckCircle2, CircleDashed, Layers3, UserRound } from "lucide-react";
import { PortalCard } from "../../../components/portal/PortalChrome";
import type { Artefacto, ArtefactoBand, ArtefactoSubmission } from "../../../lib/store";

interface ProgressDashboardProps {
  artefactos: Artefacto[];
  submissions: ArtefactoSubmission[];
  studentName: string;
}

const bandLabels: Record<ArtefactoBand, string> = {
  support: "Apoyo",
  core: "Base",
  challenge: "Reto",
};

export function ProgressDashboard({ artefactos, submissions, studentName }: ProgressDashboardProps) {
  const completedIds = new Set(
    submissions
      .filter((submission) => submission.studentName === studentName && submission.status === "completed")
      .map((submission) => submission.artefactoId),
  );
  const completedCount = artefactos.filter((artefacto) => completedIds.has(artefacto.id)).length;
  const remainingCount = Math.max(artefactos.length - completedCount, 0);
  const completionPercent = artefactos.length ? Math.round((completedCount / artefactos.length) * 100) : 0;

  return (
    <div className="grid gap-5 xl:grid-cols-[1.1fr_1.9fr]">
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
        <PortalCard className="p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#004ac6]">Resumen real</p>
              <h2 className="mt-2 text-xl font-bold text-slate-950">Actividades completadas</h2>
            </div>
            <div
              aria-label={`${completionPercent}% completado`}
              className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-[9px] border-blue-100 bg-white text-lg font-black text-[#004ac6]"
              role="img"
            >
              {completionPercent}%
            </div>
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-3">
            <ProgressStat label="Completadas" value={completedCount} />
            <ProgressStat label="Pendientes" value={remainingCount} />
          </dl>
        </PortalCard>

        <PortalCard className="p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e9f0fe] text-[#004ac6]">
              <UserRound className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Estudiante</p>
              <h2 className="truncate text-lg font-bold text-slate-950">{studentName}</h2>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-500">
            Este panel solo refleja actividades entregadas por tu docente y completadas desde tu cuenta.
          </p>
        </PortalCard>
      </div>

      <PortalCard className="p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fce7db] text-slate-900">
            <Layers3 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#004ac6]">Historial de la clase</p>
            <h2 className="text-xl font-bold text-slate-950">Tus actividades</h2>
          </div>
        </div>

        {artefactos.length > 0 ? (
          <ul className="mt-6 space-y-3">
            {artefactos.map((artefacto) => {
              const completed = completedIds.has(artefacto.id);
              const Icon = completed ? CheckCircle2 : CircleDashed;

              return (
                <li className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4" key={artefacto.id}>
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                      completed ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-[#004ac6]"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-900">{artefacto.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Ruta {bandLabels[artefacto.band]} · {artefacto.estimateLabel ?? artefacto.objective}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
                      completed ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-[#004ac6]"
                    }`}
                  >
                    {completed ? "Completada" : "Pendiente"}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center">
            <CircleDashed className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-3 text-sm font-bold text-slate-700">Aún no hay actividades para mostrar</p>
            <p className="mt-1 text-sm text-slate-500">Tu progreso aparecerá cuando recibas una actividad.</p>
          </div>
        )}
      </PortalCard>
    </div>
  );
}

function ProgressStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="mt-1 text-2xl font-black text-slate-950">{value}</dd>
    </div>
  );
}
