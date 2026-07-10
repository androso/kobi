import { CheckCircle2, Puzzle, Trash2 } from "lucide-react";
import type { Artefacto } from "../../../lib/store";

interface LessonListProps {
  title: string;
  section: string;
  artefactos: Artefacto[];
  activeId: string | undefined;
  completedIds: ReadonlySet<string>;
  onSelect: (id: string) => void;
  onDismiss?: (id: string) => void;
}

export function LessonList({
  title,
  section,
  artefactos,
  activeId,
  completedIds,
  onSelect,
  onDismiss,
}: LessonListProps) {
  return (
    <div>
      <p className="text-sm font-medium text-[#8a8f98]">{section}</p>
      <h2 className="mt-1 text-2xl font-bold leading-tight text-[#2b2b2b]">{title}</h2>

      <ul className="mt-6 space-y-1">
        {artefactos.map((artefacto, index) => {
          const isActive = artefacto.id === activeId;
          const isDone = completedIds.has(artefacto.id);
          const Icon = isDone ? CheckCircle2 : Puzzle;

          return (
            <li
              className="duration-500 animate-in fade-in slide-in-from-left-3 fill-mode-both"
              key={artefacto.id}
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <div
                className={`relative flex w-full items-center gap-2 rounded-xl transition ${
                  isActive ? "bg-[#f1f0fb]" : "hover:bg-[#f5f3ee]"
                }`}
              >
                {isActive ? (
                  <span className="absolute right-0 top-1.5 bottom-1.5 w-1 rounded-full bg-[#5b5bd6]" />
                ) : null}
                <button
                  className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left"
                  onClick={() => onSelect(artefacto.id)}
                  type="button"
                >
                  <Icon
                    className={`h-6 w-6 shrink-0 ${isDone ? "text-[#5b5bd6]" : "text-[#9aa1ac]"}`}
                    strokeWidth={1.75}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-[#2b2b2b]">
                      {String(index + 1).padStart(2, "0")}: {artefacto.title}
                    </span>
                    <span className="block truncate text-xs text-[#8a8f98]">
                      {artefacto.estimateLabel ?? artefacto.objective}
                    </span>
                  </span>
                </button>
                {onDismiss ? (
                  <button
                    aria-label={`Quitar actividad ${artefacto.title}`}
                    className="mr-3 rounded-full p-2 text-[#9aa1ac] transition hover:bg-white hover:text-[#b91c1c]"
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
