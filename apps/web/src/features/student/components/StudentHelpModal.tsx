import { useEffect } from "react";
import { X } from "lucide-react";

interface StudentHelpModalProps {
  open: boolean;
  onClose: () => void;
  classCode: string;
}

const ACCENT = "#5b5bd6";

const tips = [
  {
    title: "Abre una actividad",
    body: "Elige una lección de la lista de la izquierda para ver su contenido.",
  },
  {
    title: "Completa la actividad",
    body: "Sigue las instrucciones de la actividad y usa sus pistas cuando las necesites.",
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
      <style>{`
        @keyframes kobiLetterRise {
          0%   { transform: translateY(44px); opacity: 0; }
          55%  { opacity: 1; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes kobiPocketRise {
          0%   { transform: translateY(16px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        .kobi-letter { animation: kobiLetterRise 640ms cubic-bezier(0.22, 1, 0.36, 1) both 60ms; }
        .kobi-pocket { animation: kobiPocketRise 420ms ease-out both; }
        @media (prefers-reduced-motion: reduce) {
          .kobi-letter, .kobi-pocket { animation: none; }
        }
      `}</style>

      <div
        aria-hidden="true"
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm duration-200 animate-in fade-in"
        onClick={onClose}
      />

      {/* Envelope: the document (letter) rises out of the pocket */}
      <div className="relative z-10 w-full max-w-sm pb-6">
        <div
          aria-labelledby="student-help-title"
          aria-modal="true"
          className="kobi-letter relative z-10 overflow-hidden rounded-[24px] bg-gradient-to-b from-white to-[#eef0fb] shadow-2xl"
          role="dialog"
        >
          {/* Document header tab */}
          <div className="px-6 pt-5 pb-5" style={{ backgroundColor: ACCENT }}>
            <div className="flex items-start justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Centro de ayuda</p>
              <button
                aria-label="Cerrar ayuda"
                className="-mr-1 -mt-1 flex h-7 w-7 items-center justify-center rounded-full text-white/80 transition hover:bg-white/20 hover:text-white"
                onClick={onClose}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex gap-2">
              <span className="h-1.5 w-10 rounded-full bg-white/35" />
              <span className="h-1.5 w-10 rounded-full bg-white/35" />
              <span className="h-1.5 w-10 rounded-full bg-white/35" />
            </div>
          </div>

          {/* Document body */}
          <div className="px-6 pb-16 pt-5">
            <h2 className="font-serif text-2xl font-bold leading-tight text-[#1f2340]" id="student-help-title">
              Cómo usar tu panel
            </h2>

            <ul className="mt-4 space-y-3">
              {tips.map((tip) => (
                <li className="flex items-start gap-3" key={tip.title}>
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: ACCENT }} />
                  <div>
                    <p className="text-sm font-semibold text-[#2b2b2b]">{tip.title}</p>
                    <p className="text-xs text-[#8a8f98]">{tip.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Envelope pocket the letter emerges from */}
        <div
          className="kobi-pocket absolute inset-x-4 bottom-0 z-20 flex h-14 items-center justify-between rounded-2xl px-5 shadow-lg"
          style={{ backgroundColor: ACCENT }}
        >
          <span className="text-xs font-medium uppercase tracking-wide text-white/70">Código de clase</span>
          <span className="text-sm font-bold text-white">{classCode}</span>
        </div>
      </div>
    </div>
  );
}
