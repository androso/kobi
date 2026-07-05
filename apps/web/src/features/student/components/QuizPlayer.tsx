import { useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, HelpCircle, RotateCcw, XCircle } from "lucide-react";
import { Button } from "../../../components/ui/button";
import type { QuizContent } from "../../../lib/artifacts";
import type { Artefacto } from "../../../lib/store";
import { useClassStore } from "../../../lib/store";

interface QuizPlayerProps {
  artefacto: Artefacto;
  content: QuizContent;
  studentName: string;
}

export function QuizPlayer({ artefacto, content, studentName }: QuizPlayerProps) {
  const submitArtefacto = useClassStore((state) => state.submitArtefacto);
  const questions = content.questions;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [revealedHints, setRevealedHints] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);

  function goPrev() {
    setDirection("prev");
    setCurrentIndex((i) => Math.max(0, i - 1));
  }

  function goNext() {
    setDirection("next");
    setCurrentIndex((i) => Math.min(questions.length - 1, i + 1));
  }

  const question = questions[currentIndex];
  const selectedChoiceId = answers[question.id];
  const isLast = currentIndex === questions.length - 1;
  const allAnswered = questions.every((q) => answers[q.id]);
  const revealed = revealedHints[question.id] ?? 0;

  const score = useMemo(
    () => questions.filter((q) => answers[q.id] === q.correctChoiceId).length,
    [questions, answers],
  );

  function handleSelect(choiceId: string) {
    if (submitted) return;
    setAnswers((current) => ({ ...current, [question.id]: choiceId }));
  }

  function handleRevealHint() {
    const hints = question.hints ?? [];
    if (revealed < hints.length) {
      setRevealedHints((current) => ({ ...current, [question.id]: revealed + 1 }));
    }
  }

  function handleSubmit() {
    if (!allAnswered) return;

    const answerList = questions.map((q) => ({
      questionId: q.id,
      choiceId: answers[q.id],
      correct: answers[q.id] === q.correctChoiceId,
    }));
    const hintsUsed = Object.values(revealedHints).reduce((sum, n) => sum + n, 0);

    submitArtefacto({
      artefactoId: artefacto.id,
      classId: artefacto.classId,
      studentName,
      answers: answerList,
      score: answerList.filter((a) => a.correct).length,
      total: questions.length,
      attempts: 1,
      hintsUsed,
    });
    setSubmitted(true);
  }

  function handleRetry() {
    setAnswers({});
    setRevealedHints({});
    setSubmitted(false);
    setCurrentIndex(0);
  }

  if (submitted) {
    const passed = score === questions.length;
    return (
      <div className="mt-8 duration-500 animate-in fade-in slide-in-from-bottom-3 fill-mode-both">
        <div
          className={`rounded-3xl border p-6 duration-500 animate-in zoom-in-95 fill-mode-both ${
            passed ? "border-emerald-100 bg-emerald-50" : "border-amber-100 bg-amber-50"
          }`}
        >
          <div className="flex items-center gap-2 text-lg font-bold">
            {passed ? (
              <>
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                <span className="text-emerald-900">¡Respuesta correcta en todas!</span>
              </>
            ) : (
              <>
                <XCircle className="h-6 w-6 text-amber-600" />
                <span className="text-amber-900">Puedes mejorar</span>
              </>
            )}
          </div>
          <p className={`mt-1 text-sm ${passed ? "text-emerald-800" : "text-amber-800"}`}>
            Obtuviste {score} de {questions.length} respuestas correctas.
          </p>
        </div>

        <ol className="mt-6 space-y-4">
          {questions.map((q, index) => {
            const chosen = answers[q.id];
            const correct = chosen === q.correctChoiceId;
            const chosenLabel = q.choices.find((c) => c.id === chosen)?.label ?? "—";
            const correctLabel = q.choices.find((c) => c.id === q.correctChoiceId)?.label ?? "";

            return (
              <li className="rounded-2xl border border-[#ece9e2] bg-white p-4" key={q.id}>
                <div className="flex items-start gap-3">
                  {correct ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#2b2b2b]">
                      {index + 1}. {q.prompt}
                    </p>
                    <p className="mt-1 text-sm text-[#7c8189]">
                      Tu respuesta: <span className="font-medium">{chosenLabel}</span>
                      {!correct ? (
                        <>
                          {" · "}Correcta: <span className="font-medium text-emerald-700">{correctLabel}</span>
                        </>
                      ) : null}
                    </p>
                    {q.explanation ? <p className="mt-1 text-xs text-[#a2a7af]">{q.explanation}</p> : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <button
          className="mt-6 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-[#5b5bd6] transition hover:bg-[#eeeefb]"
          onClick={handleRetry}
          type="button"
        >
          <RotateCcw className="h-4 w-4" />
          Volver a intentar
        </button>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium text-[#8a8f98]">
          Pregunta {currentIndex + 1} de {questions.length}
        </p>
        <div className="flex gap-1.5">
          {questions.map((q, index) => (
            <span
              className={`h-1.5 w-6 rounded-full ${
                index === currentIndex ? "bg-[#5b5bd6]" : answers[q.id] ? "bg-[#c7c7f0]" : "bg-[#e6e3dc]"
              }`}
              key={q.id}
            />
          ))}
        </div>
      </div>

      <div
        className={`duration-300 animate-in fade-in fill-mode-both ${
          direction === "next" ? "slide-in-from-right-6" : "slide-in-from-left-6"
        }`}
        key={question.id}
      >
        <h3 className="text-2xl font-bold leading-snug text-[#2b2b2b]">{question.prompt}</h3>
        <p className="mt-1 text-sm text-[#8a8f98]">Elige una sola respuesta:</p>

        <div className="mt-5 space-y-3">
          {question.choices.map((choice, index) => {
            const isSelected = selectedChoiceId === choice.id;

            return (
              <button
                className={`flex w-full items-center gap-4 rounded-2xl border px-5 py-4 text-left transition duration-300 animate-in fade-in slide-in-from-bottom-2 fill-mode-both ${
                  isSelected
                    ? "border-[#5b5bd6] bg-[#eeeefb]"
                    : "border-[#ece9e2] bg-white hover:border-[#cdcdf2] hover:bg-[#f7f7fd]"
                }`}
                key={choice.id}
                onClick={() => handleSelect(choice.id)}
                style={{ animationDelay: `${100 + index * 60}ms` }}
                type="button"
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    isSelected ? "border-[#5b5bd6]" : "border-[#c9c6bf]"
                  }`}
                >
                  {isSelected ? <span className="h-2.5 w-2.5 rounded-full bg-[#5b5bd6]" /> : null}
                </span>
                <span className="text-[15px] leading-6 text-[#2b2b2b]">{choice.label}</span>
              </button>
            );
          })}
        </div>

        {question.hints && question.hints.length > 0 ? (
          <div className="mt-4">
            <button
              className="inline-flex items-center gap-2 text-sm font-medium text-[#5b5bd6] transition hover:text-[#4444c0]"
              onClick={handleRevealHint}
              type="button"
            >
              <HelpCircle className="h-4 w-4" />
              {revealed < question.hints.length ? "Mostrar pista" : "Sin más pistas"}
            </button>
            {revealed > 0 ? (
              <ul className="mt-2 space-y-2">
                {question.hints.slice(0, revealed).map((hint) => (
                  <li
                    className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 duration-300 animate-in fade-in slide-in-from-top-1 fill-mode-both"
                    key={hint}
                  >
                    {hint}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-8 flex items-center justify-between border-t border-[#ece9e2] pt-5">
        <button
          className="inline-flex items-center gap-1 rounded-xl px-4 py-2 text-sm font-semibold text-[#7c8189] transition hover:bg-[#f0ede7] disabled:opacity-40 disabled:hover:bg-transparent"
          disabled={currentIndex === 0}
          onClick={goPrev}
          type="button"
        >
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </button>

        {isLast ? (
          <Button
            className="bg-[#5b5bd6] hover:bg-[#4a4ac2] disabled:opacity-40"
            disabled={!allAnswered}
            onClick={handleSubmit}
            type="button"
          >
            Entregar
          </Button>
        ) : (
          <button
            className="inline-flex items-center gap-1 rounded-xl bg-[#5b5bd6] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#4a4ac2] disabled:opacity-40"
            disabled={!selectedChoiceId}
            onClick={goNext}
            type="button"
          >
            Siguiente
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
