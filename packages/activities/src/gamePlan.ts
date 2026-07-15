import type { CurriculumMatch } from "@kobi/curriculum";
import type {
  ActivityFamily,
  ActivityMechanic,
  DifficultyBand,
  SessionContext,
} from "./types.js";

export interface GamePlanBandRequirement {
  band: DifficultyBand;
  requirement: string;
}

export interface GamePlan {
  family: ActivityFamily;
  mechanic: ActivityMechanic;
  learning_goal: string;
  interaction_metaphor: string;
  kobi_visual_direction: string;
  rationale: string;
  band_requirements: Record<DifficultyBand, string>;
}

const planBySignal: Array<{
  signal: RegExp;
  family: ActivityFamily;
  mechanic: ActivityMechanic;
  metaphor: string;
}> = [
  { signal: /noticia|fuente|evidencia|dato|hecho/i, family: "guided_practice", mechanic: "source_check_desk", metaphor: "mesa de verificacion de fuentes" },
  { signal: /secuencia|orden|paso|linea|tiempo|cronolog/i, family: "sequence_order", mechanic: "timeline_builder", metaphor: "linea de tiempo manipulable" },
  { signal: /argument|opinion|justifica|compar/i, family: "guided_practice", mechanic: "argument_builder", metaphor: "taller de argumentos" },
  { signal: /vocab|palabra|termin|concept/i, family: "match_classify", mechanic: "vocabulary_lab", metaphor: "laboratorio de vocabulario" },
];

export function createGamePlan(context: SessionContext, curriculumMatches: CurriculumMatch[]): GamePlan {
  const primary = curriculumMatches[0];
  const searchable = [
    context.latest_topic,
    context.latest_objective ?? "",
    ...context.vocabulary,
    primary?.text ?? "",
  ].join(" ");
  const selected = planBySignal.find((plan) => plan.signal.test(searchable)) ?? {
    family: "match_classify" as const,
    mechanic: "sorting_board" as const,
    metaphor: "tablero de clasificacion Kobi",
  };
  const objective = primary?.objective_code ?? context.latest_objective ?? "el objetivo de la clase";
  const topic = context.latest_topic || "la clase actual";

  return {
    family: selected.family,
    mechanic: selected.mechanic,
    learning_goal: `Practicar ${topic} conectado con ${objective}.`,
    interaction_metaphor: selected.metaphor,
    kobi_visual_direction:
      "Base azul Kobi, superficies redondeadas, acentos moderados del tema, progreso visible, feedback inmediato y movimiento respetuoso de reduced-motion.",
    rationale: `Un solo concepto (${selected.metaphor}) mantiene coherencia entre apoyo, core y reto mientras ajusta andamiaje y exigencia.`,
    band_requirements: {
      support: "Menos opciones, instrucciones guiadas, pistas progresivas y confirmacion clara.",
      core: "Manipulacion activa, feedback inmediato y aplicacion directa del objetivo.",
      challenge: "Justificacion, comparacion o sintesis breve antes de completar.",
    },
  };
}
