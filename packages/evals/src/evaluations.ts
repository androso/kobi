import { readFile } from "node:fs/promises";
import { z } from "zod";
import { lessonStateSchema, type LessonState } from "@kobi/ai-core";

const relevanceSchema = z.enum(["primary", "supporting"]);

export const relevantPageSchema = z.object({
  page: z.number().int().positive(),
  relevance: relevanceSchema,
});

export const classContextSchema = z.object({
  grade: z.number().int().positive(),
  subject: z.string().min(1),
  unit: z.string().min(1),
});

export const evaluationFixtureSchema = z.object({
  id: z.string().min(1),
  classContext: classContextSchema,
  sanitizedTranscript: z.string().min(1),
  expectedConcepts: z.array(z.string().min(1)).min(1),
  relevantPages: z.array(relevantPageSchema).min(2),
  goldLessonState: lessonStateSchema,
});

export type EvaluationFixture = z.infer<typeof evaluationFixtureSchema>;
export type RelevantPage = z.infer<typeof relevantPageSchema>;
export type ClassContext = z.infer<typeof classContextSchema>;

export interface RetrievedPage {
  sourcePageStart: number | null;
  sourcePageEnd?: number | null;
  objectiveCode?: string;
  similarity?: number;
}

export interface CurriculumMatchLike {
  source_page_start?: number | null;
  source_page_end?: number | null;
  objective_code: string;
  similarity: number;
  text?: string;
  source_document?: string | null;
}

export interface RetrievalScore {
  weightedRecallAt3: number;
  precisionAt3: number;
  meanReciprocalRank: number;
  nDCGAt3: number;
  distinctRelevantPages: number;
}

export interface EvaluationFeedback {
  key: string;
  score: number;
}

export interface RetrievalLabelSet {
  relevantPages: RelevantPage[];
}

export async function loadEvaluationFixture(path: string): Promise<EvaluationFixture> {
  return evaluationFixtureSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

/**
 * Strip curriculum match content so LangSmith/logs only keep page metadata.
 */
export function sanitizeCurriculumMatches(matches: CurriculumMatchLike[]): RetrievedPage[] {
  return matches.map((match) => ({
    sourcePageStart: match.source_page_start ?? null,
    sourcePageEnd: match.source_page_end ?? null,
    objectiveCode: match.objective_code,
    similarity: match.similarity,
  }));
}

export function scoreRetrieval(
  labels: RetrievalLabelSet,
  matches: RetrievedPage[],
): RetrievalScore {
  const weights = new Map(labels.relevantPages.map((item) => [item.page, item.relevance === "primary" ? 3 : 1]));
  const uniqueRelevantPages = new Set<number>();
  let weightedGain = 0;
  let dcg = 0;
  let reciprocalRank = 0;

  matches.slice(0, 3).forEach((match, index) => {
    const page = match.sourcePageStart;
    const gain = page == null || uniqueRelevantPages.has(page) ? 0 : weights.get(page) ?? 0;
    if (!gain || page == null) return;
    uniqueRelevantPages.add(page);
    weightedGain += gain;
    dcg += (2 ** gain - 1) / Math.log2(index + 2);
    if (!reciprocalRank) reciprocalRank = 1 / (index + 1);
  });

  const idealGains = [...weights.values()].sort((left, right) => right - left).slice(0, 3);
  const idealDcg = idealGains.reduce((total, gain, index) => total + (2 ** gain - 1) / Math.log2(index + 2), 0);
  const totalWeight = [...weights.values()].reduce((total, weight) => total + weight, 0);
  const relevantCount = uniqueRelevantPages.size;

  return {
    weightedRecallAt3: totalWeight === 0 ? 0 : weightedGain / totalWeight,
    precisionAt3: relevantCount / 3,
    meanReciprocalRank: reciprocalRank,
    nDCGAt3: idealDcg === 0 ? 0 : dcg / idealDcg,
    distinctRelevantPages: uniqueRelevantPages.size,
  };
}

/**
 * LangSmith evaluator for retrieval quality vs labeled relevantPages.
 */
export function createRetrievalEvaluators(labels: RetrievalLabelSet) {
  return [
    ({ outputs }: { outputs: Record<string, unknown> }): EvaluationFeedback[] => {
      const matches = readRetrievedPages(outputs.matches);
      const scores = scoreRetrieval(labels, matches);
      return [
        { key: "weighted_recall_at_3", score: scores.weightedRecallAt3 },
        { key: "precision_at_3", score: scores.precisionAt3 },
        { key: "mrr", score: scores.meanReciprocalRank },
        { key: "ndcg_at_3", score: scores.nDCGAt3 },
      ];
    },
  ];
}

export function toSanitizedLessonState(
  state: Pick<LessonState, "topic" | "objective_guess" | "key_terms" | "transcript_summary" | "confidence">,
) {
  return {
    topic: state.topic,
    objective_guess: state.objective_guess,
    key_terms: state.key_terms,
    transcript_summary: state.transcript_summary,
    confidence: state.confidence,
  };
}

function readRetrievedPages(value: unknown): RetrievedPage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const sourcePageStart =
      typeof record.sourcePageStart === "number"
        ? record.sourcePageStart
        : record.sourcePageStart === null
          ? null
          : null;
    return [
      {
        sourcePageStart,
        sourcePageEnd:
          typeof record.sourcePageEnd === "number"
            ? record.sourcePageEnd
            : record.sourcePageEnd === null
              ? null
              : undefined,
        objectiveCode: typeof record.objectiveCode === "string" ? record.objectiveCode : undefined,
        similarity: typeof record.similarity === "number" ? record.similarity : undefined,
      },
    ];
  });
}
