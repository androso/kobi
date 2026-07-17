import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCurriculumQueryText,
  retrieveCurriculumMatches,
  type LessonStateQueryInput,
} from "@kobi/curriculum";
import { traceable } from "langsmith/traceable";
import {
  sanitizeCurriculumMatches,
  toSanitizedLessonState,
  type RetrievedPage,
} from "./evaluations.js";

export interface CurriculumRagClassContext {
  grade: number;
  subject: string;
  unit: string;
}

export interface CurriculumRagTargetInput {
  lessonState: LessonStateQueryInput;
  classContext?: CurriculumRagClassContext;
}

export interface CurriculumRagResult {
  queryText: string;
  matches: RetrievedPage[];
  matchCount: number;
}

export interface CreateTracedCurriculumRetrieverOptions {
  supabase: SupabaseClient;
  classContext: CurriculumRagClassContext;
  sourceIds: string[];
  matchCount?: number;
  projectName?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  return value.filter((item): item is string => typeof item === "string");
}

function readLessonState(value: unknown): LessonStateQueryInput {
  if (!isRecord(value)) {
    return { topic: "", objective_guess: null, key_terms: [], transcript_summary: "" };
  }
  return {
    topic: readString(value.topic),
    objective_guess:
      typeof value.objective_guess === "string" || value.objective_guess === null
        ? value.objective_guess
        : null,
    key_terms: readStringArray(value.key_terms, []),
    transcript_summary: readString(value.transcript_summary),
  };
}

function summarizeLessonState(lessonState: LessonStateQueryInput) {
  return {
    ...toSanitizedLessonState({
      topic: lessonState.topic,
      objective_guess: lessonState.objective_guess ?? null,
      key_terms: lessonState.key_terms ?? [],
      transcript_summary: lessonState.transcript_summary ?? "",
      confidence: 0,
    }),
    key_term_count: lessonState.key_terms?.length ?? 0,
  };
}

/**
 * Builds a privacy-safe, nested-traced target for LangSmith evaluate().
 * evaluate() wraps the plain target; nested spans cover query + retrieval.
 */
export function createTracedCurriculumRetriever(options: CreateTracedCurriculumRetrieverOptions) {
  const matchCount = options.matchCount ?? 3;
  const projectName = options.projectName ?? process.env.LANGSMITH_PROJECT?.trim() ?? "kobi-evals";

  const buildQuery = traceable(
    async (input: { lessonState: LessonStateQueryInput }) => {
      const queryText = buildCurriculumQueryText(input.lessonState);
      return { queryText, queryTextChars: queryText.length };
    },
    {
      name: "build_curriculum_query",
      run_type: "chain",
      project_name: projectName,
      tags: ["kobi", "rag", "query"],
      processInputs: (inputs) => {
        const lessonState = isRecord(inputs) ? readLessonState(inputs.lessonState) : readLessonState(null);
        return { lessonState: summarizeLessonState(lessonState) };
      },
      processOutputs: (outputs) => {
        if (!isRecord(outputs)) return { queryText: "", queryTextChars: 0 };
        return {
          queryText: readString(outputs.queryText),
          queryTextChars: readNumber(outputs.queryTextChars, 0),
        };
      },
    },
  );

  const retrieveMatches = traceable(
    async (input: {
      queryText: string;
      grade: number;
      subject: string;
      unit: string;
      sourceIds: string[];
      matchCount: number;
    }) => {
      const matches = await retrieveCurriculumMatches(
        options.supabase as unknown as Parameters<typeof retrieveCurriculumMatches>[0],
        {
        queryText: input.queryText,
        grade: input.grade,
        subject: input.subject,
        unit: input.unit,
        sourceIds: input.sourceIds,
        matchCount: input.matchCount,
      });
      return {
        matches: sanitizeCurriculumMatches(matches),
        rawMatchCount: matches.length,
      };
    },
    {
      name: "retrieve_curriculum_matches",
      run_type: "retriever",
      project_name: projectName,
      tags: ["kobi", "rag", "retriever"],
      metadata: {
        match_count: matchCount,
        source_ids: options.sourceIds,
      },
      processInputs: (inputs) => {
        if (!isRecord(inputs)) {
          return {
            queryText: "",
            queryTextChars: 0,
            grade: options.classContext.grade,
            subject: options.classContext.subject,
            unit: options.classContext.unit,
            sourceIds: options.sourceIds,
            matchCount,
          };
        }
        const queryText = readString(inputs.queryText);
        return {
          queryText,
          queryTextChars: queryText.length,
          grade: readNumber(inputs.grade, options.classContext.grade),
          subject: readString(inputs.subject, options.classContext.subject),
          unit: readString(inputs.unit, options.classContext.unit),
          sourceIds: readStringArray(inputs.sourceIds, options.sourceIds),
          matchCount: readNumber(inputs.matchCount, matchCount),
        };
      },
      processOutputs: (outputs) => {
        if (!isRecord(outputs) || !Array.isArray(outputs.matches)) {
          return { matchCount: 0, matches: [] };
        }
        return {
          matchCount: outputs.matches.length,
          matches: outputs.matches,
        };
      },
    },
  );

  const retrieve = async (lessonState: LessonStateQueryInput): Promise<CurriculumRagResult> => {
    const query = await buildQuery({ lessonState });
    const retrieval = await retrieveMatches({
      queryText: query.queryText,
      grade: options.classContext.grade,
      subject: options.classContext.subject,
      unit: options.classContext.unit,
      sourceIds: options.sourceIds,
      matchCount,
    });

    return {
      queryText: query.queryText,
      matches: retrieval.matches,
      matchCount: retrieval.matches.length,
    };
  };

  return {
    /**
     * LangSmith evaluate() target. Keep this plain so evaluate can attach
     * reference_example_id / experiment metadata; nested spans still nest.
     */
    target: async (inputs: CurriculumRagTargetInput): Promise<CurriculumRagResult> => {
      return retrieve(inputs.lessonState);
    },
    retrieve,
  };
}
