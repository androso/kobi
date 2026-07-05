import { useEffect } from "react";
import { BookOpen, ListChecks, LifeBuoy, TrendingUp, X } from "lucide-react";

interface StudentHelpModalProps {
  open: boolean;
  onClose: () => void;
  classCode: string;
}

const tips = [
  {
    icon: BookOpen,
    title: "Abre una actividad",
    body: "Elige una lección de la lista de la izquierda para ver su contenido.",
  },
  {
    icon: ListChecks,
    title: "Responde el quiz",
    body: "Selecciona una respuesta, avanza con Siguiente y entrega al final. Usa las pistas si te atoras.",
  },
  {
    icon: TrendingUp,
    title: "Revisa tu progreso",
    body: "En la sección Progreso ves tu precisión, dominio y actividades completadas.",
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

      <div
        aria-labelledby="student-help-title"
        aria-modal="true"
        className="relative z-10 w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl duration-200 animate-in fade-in zoom-in-95"
        role="dialog"
      >
        <button
          aria-label="Cerrar ayuda"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          onClick={onClose}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e3f3ee] text-[#2f9e8f]">
            <LifeBuoy className="h-6 w-6" strokeWidth={1.75} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#2b2b2b]" id="student-help-title">
              Centro de ayuda
            </h2>
            <p className="text-sm text-[#8a8f98]">Cómo usar tu panel de estudiante</p>
          </div>
        </div>

        <ul className="mt-5 space-y-4">
          {tips.map((tip) => {
            const Icon = tip.icon;
            return (
              <li className="flex items-start gap-3" key={tip.title}>
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#f4f2ec] text-[#2f9e8f]">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#2b2b2b]">{tip.title}</p>
                  <p className="text-sm text-[#8a8f98]">{tip.body}</p>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 rounded-2xl bg-[#f7f5f0] px-4 py-3 text-sm text-[#5b6270]">
          Tu código de clase es <span className="font-bold text-[#2b2b2b]">{classCode}</span>. Si tienes
          problemas, avísale a tu profesor.
        </div>

        <button
          className="mt-6 w-full rounded-xl bg-[#2f9e8f] py-2.5 text-sm font-semibold text-white transition hover:bg-[#278577]"
          onClick={onClose}
          type="button"
        >
          Entendido
        </button>
      </div>
    </div>
  );
}
