import { useEffect } from "react";
import { Check, GraduationCap } from "lucide-react";

interface StudentHelpModalProps {
  open: boolean;
  onClose: () => void;
  classCode: string;
}

const tips = [
  {
    title: "Abre una actividad",
    body: "Elige una lección de la lista de la izquierda para ver su contenido.",
  },
  {
    title: "Responde el quiz",
    body: "Selecciona una respuesta, avanza con Siguiente y entrega al final.",
  },
  {
    title: "Revisa tu progreso",
    body: "En Progreso ves tu precisión, dominio y actividades completadas.",
  },
];

export function StudentHelpModal({ open, onClose, classCode }: StudentHelpModalProps) {
  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm duration-200 animate-in fade-in"
        onClick={onClose}
      />

      {/* Gradient-bordered card */}
      <div className="relative z-10 w-full max-w-sm rounded-[28px] bg-gradient-to-br from-amber-300 via-fuchsia-400 to-sky-400 p-[3px] shadow-2xl duration-200 animate-in fade-in zoom-in-95">
        <div
          aria-labelledby="student-help-title"
          aria-modal="true"
          className="rounded-[25px] bg-white p-6"
          role="dialog"
        >
          <div className="flex items-start justify-between">
            <GraduationCap className="h-7 w-7 text-[#2f9e8f]" strokeWidth={2} />
            <span className="rounded-full bg-[#eef2ff] px-3 py-1 text-xs font-semibold text-[#5b5bd6]">
              Ayuda
            </span>
          </div>

          <h2 className="mt-4 text-lg font-bold text-[#2b2b2b]" id="student-help-title">
            Centro de ayuda
          </h2>
          <p className="mt-1 text-sm text-[#8a8f98]">Cómo usar tu panel de estudiante.</p>

          <div className="mt-6">
            <p className="text-4xl font-bold tracking-tight text-[#2b2b2b]">
              {classCode} <span className="text-sm font-normal text-[#8a8f98]">tu código de clase</span>
            </p>
          </div>

          <button
            className="mt-5 w-full rounded-xl bg-[#1a1a1a] py-3 text-sm font-semibold text-white transition hover:bg-black"
            onClick={onClose}
            type="button"
          >
            Entendido
          </button>

          <ul className="mt-6 space-y-3 border-t border-[#f0ede7] pt-5">
            {tips.map((tip) => (
              <li className="flex items-start gap-2.5" key={tip.title}>
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" strokeWidth={3} />
                <div>
                  <p className="text-sm font-medium text-[#5b6270]">{tip.title}</p>
                  <p className="text-xs text-[#a2a7af]">{tip.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
