import { CheckCircle2, Puzzle, Trash2 } from "lucide-react";
import type { Artefacto, ArtefactoSubmission } from "../../../lib/store";

interface LessonListProps {
  title: string;
  section: string;
  artefactos: Artefacto[];
  activeId: string | undefined;
  submissions: ArtefactoSubmission[];
  studentName: string;
  onSelect: (id: string) => void;
  onDismiss?: (id: string) => void;
}

export function LessonList({
  title,
  section,
  artefactos,
  activeId,
  submissions,
  studentName,
  onSelect,
  onDismiss,
}: LessonListProps) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#004ac6]">{section}</p>
      <h2 className="mt-2 text-xl font-bold leading-tight text-slate-950">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">
        {artefactos.length > 0 ? "Selecciona tu actividad para comenzar." : "Esperando una actividad de tu docente."}
      </p>

      <ul className="mt-5 space-y-2">
        {artefactos.map((artefacto, index) => {
          const isActive = artefacto.id === activeId;
          const isDone = submissions.some(
            (sub) =>
              sub.artefactoId === artefacto.id &&
              sub.studentName === studentName &&
              sub.status === "completed",
          );
          const Icon = isDone ? CheckCircle2 : Puzzle;

          return (
            <li
              className="duration-500 animate-in fade-in slide-in-from-left-3 fill-mode-both"
              key={artefacto.id}
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <div
                className={`relative flex w-full items-center gap-2 rounded-2xl border transition ${
                  isActive ? "border-blue-100 bg-[#e9f0fe]" : "border-transparent bg-slate-50 hover:border-slate-200"
                }`}
              >
                {isActive ? (
                  <span className="absolute bottom-3 right-0 top-3 w-1 rounded-full bg-[#004ac6]" />
                ) : null}
                <button
                  className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left"
                  onClick={() => onSelect(artefacto.id)}
                  type="button"
                >
                  <Icon
                    className={`h-6 w-6 shrink-0 ${isDone || isActive ? "text-[#004ac6]" : "text-slate-400"}`}
                    strokeWidth={1.75}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-slate-900">
                      {String(index + 1).padStart(2, "0")}: {artefacto.title}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {artefacto.estimateLabel ?? artefacto.objective}
                    </span>
                  </span>
                </button>
                {onDismiss ? (
                  <button
                    aria-label={`Quitar actividad ${artefacto.title}`}
                    className="mr-3 rounded-full p-2 text-slate-400 transition hover:bg-white hover:text-red-700"
                    onClick={() => onDismiss(artefacto.id)}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.8} />
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
