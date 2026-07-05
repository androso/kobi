import { CheckCircle2, FileText, PlayCircle, type LucideIcon } from "lucide-react";
import type { Artefacto, ArtefactoSubmission } from "../../../lib/store";

interface LessonListProps {
  title: string;
  section: string;
  artefactos: Artefacto[];
  activeId: string | undefined;
  submissions: ArtefactoSubmission[];
  studentName: string;
  onSelect: (id: string) => void;
}

const kindIcon: Record<Artefacto["kind"], LucideIcon> = {
  quiz: FileText,
  reading: FileText,
  video: PlayCircle,
};

export function LessonList({
  title,
  section,
  artefactos,
  activeId,
  submissions,
  studentName,
  onSelect,
}: LessonListProps) {
  return (
    <div>
      <p className="text-sm font-medium text-[#8a8f98]">{section}</p>
      <h2 className="mt-1 text-2xl font-bold leading-tight text-[#2b2b2b]">{title}</h2>

      <ul className="mt-6 space-y-1">
        {artefactos.map((artefacto, index) => {
          const isActive = artefacto.id === activeId;
          const isDone = submissions.some(
            (sub) =>
              sub.artefactoId === artefacto.id &&
              sub.studentName === studentName &&
              sub.status === "completed",
          );
          const Icon = isDone ? CheckCircle2 : kindIcon[artefacto.kind];

          return (
            <li
              className="duration-500 animate-in fade-in slide-in-from-left-3 fill-mode-both"
              key={artefacto.id}
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <button
                className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                  isActive ? "bg-[#f1f0fb]" : "hover:bg-[#f5f3ee]"
                }`}
                onClick={() => onSelect(artefacto.id)}
                type="button"
              >
                {isActive ? (
                  <span className="absolute right-0 top-1.5 bottom-1.5 w-1 rounded-full bg-[#5b5bd6]" />
                ) : null}
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
            </li>
          );
        })}
      </ul>
    </div>
  );
}
