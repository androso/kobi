import { ChevronRight, Home } from "lucide-react";
import type { Artefacto } from "../../../lib/store";
import { QuizPlayer } from "./QuizPlayer";

interface ArtifactRendererProps {
  artefacto: Artefacto;
  studentName: string;
}

export function ArtifactRenderer({ artefacto, studentName }: ArtifactRendererProps) {
  const { content } = artefacto;

  return (
    <div className="mx-auto max-w-2xl">
      <nav aria-label="Ruta" className="flex flex-wrap items-center gap-1.5 text-sm text-[#8a8f98]">
        <Home className="h-4 w-4" strokeWidth={1.75} />
        {(artefacto.breadcrumb ?? [artefacto.section]).map((part) => (
          <span className="flex items-center gap-1.5" key={part}>
            <ChevronRight className="h-3.5 w-3.5 text-[#c2c6cd]" />
            <span className="font-medium text-[#5b6270]">{part}</span>
          </span>
        ))}
      </nav>

      <header className="mt-8 text-center">
        {artefacto.estimateLabel ? (
          <span className="inline-block rounded-full bg-[#eeeefb] px-3 py-1 text-xs font-semibold text-[#5b5bd6]">
            {artefacto.estimateLabel}
          </span>
        ) : null}
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#2b2b2b]">{artefacto.title}</h2>
      </header>

      <hr className="mt-6 border-[#ece9e2]" />

      {content.type === "quiz" ? (
        <QuizPlayer artefacto={artefacto} content={content} studentName={studentName} />
      ) : (
        <div className="mt-8 rounded-3xl border border-dashed border-[#e0ddd5] bg-white/60 p-8 text-center text-sm text-[#8a8f98]">
          Este tipo de artefacto ({content.type}) estará disponible próximamente.
        </div>
      )}
    </div>
  );
}
