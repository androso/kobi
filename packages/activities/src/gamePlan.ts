import type { CurriculumMatch } from "@kobi/curriculum";
import type {
  ActivityFamily,
  ActivityManifest,
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
  ability: string;
}> = [
  {
    signal: /noticia|fuente|evidencia|dato|hecho|titular|entradilla/i,
    family: "guided_practice",
    mechanic: "source_check_desk",
    metaphor: "mesa de verificacion de fuentes",
    ability: "verificar y clasificar evidencias de una noticia",
  },
  {
    signal: /secuencia|orden|paso|linea|tiempo|cronolog|proceso/i,
    family: "sequence_order",
    mechanic: "timeline_builder",
    metaphor: "linea de tiempo manipulable",
    ability: "ordenar hechos o pasos con precision",
  },
  {
    signal: /argument|opinion|justifica|compar|persuad/i,
    family: "guided_practice",
    mechanic: "argument_builder",
    metaphor: "taller de argumentos",
    ability: "construir y justificar una postura breve",
  },
  {
    signal: /historia|relato|narrativ|cuento|trama/i,
    family: "sequence_order",
    mechanic: "story_path",
    metaphor: "taller de recorrido narrativo",
    ability: "reconstruir el orden de una narrativa",
  },
  {
    signal: /vocab|palabra|termin|concept|sinon|anton/i,
    family: "match_classify",
    mechanic: "vocabulary_lab",
    metaphor: "laboratorio de vocabulario",
    ability: "relacionar terminos con significados en contexto",
  },
  {
    signal: /clasific|categoria|tipo|grupo|parea|relacion/i,
    family: "match_classify",
    mechanic: "sorting_board",
    metaphor: "tablero de clasificacion Kobi",
    ability: "clasificar ejemplos segun criterios del objetivo",
  },
  {
    signal: /detectiv|pista|indicio|analiza|inspeccion/i,
    family: "match_classify",
    mechanic: "evidence_detective",
    metaphor: "mapa de evidencias",
    ability: "encontrar y conectar evidencias textuales",
  },
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
    family: "guided_practice" as const,
    mechanic: "source_check_desk" as const,
    metaphor: "estudio de practicas del objetivo",
    ability: "aplicar el objetivo con manipulacion guiada",
  };
  const objective = primary?.objective_code ?? context.latest_objective ?? "el objetivo de la clase";
  const topic = context.latest_topic || "la clase actual";

  return {
    family: selected.family,
    mechanic: selected.mechanic,
    learning_goal: `Practicar ${selected.ability} sobre ${topic}, conectado con ${objective}.`,
    interaction_metaphor: selected.metaphor,
    kobi_visual_direction:
      "Base azul Kobi, superficies redondeadas, acentos moderados del tema, progreso visible, feedback inmediato y movimiento respetuoso de reduced-motion.",
    rationale: `Un solo concepto interactivo (${selected.metaphor}) mantiene coherencia entre apoyo, core y reto mientras los estudiantes practican ${selected.ability} en vez de responder un cuestionario.`,
    band_requirements: {
      support:
        "Andamiaje alto: menos piezas, pasos guiados, pistas progresivas y confirmacion inmediata tras cada movimiento.",
      core:
        "Manipulacion activa del concepto con feedback inmediato y aplicacion directa del objetivo.",
      challenge:
        "Misma mecanica con mayor exigencia: justificar, comparar o sintetizar antes de completar.",
    },
  };
}

export function createAdaptedGamePlan(
  context: SessionContext,
  curriculumMatches: CurriculumMatch[],
  parentManifest: ActivityManifest,
): GamePlan {
  const currentPlan = createGamePlan(context, curriculumMatches);
  if (!parentManifest.mechanic) return currentPlan;

  return {
    ...currentPlan,
    family: parentManifest.family,
    mechanic: parentManifest.mechanic,
    interaction_metaphor:
      parentManifest.visual_theme?.scene ?? currentPlan.interaction_metaphor,
    rationale: `Adapta el mecanismo ${parentManifest.mechanic} de una actividad verificada al contexto actual, conservando una sola experiencia interactiva para apoyo, core y reto.`,
  };
}
