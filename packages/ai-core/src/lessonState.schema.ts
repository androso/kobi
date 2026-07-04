import { z } from "zod";

/**
 * The rolling picture of what's being taught right now (Area A output).
 * Kept small on purpose — the teacher UI renders this directly as a card.
 */
export const lessonStateSchema = z.object({
  topic: z.string().describe("Short topic label, e.g. 'El sustantivo y sus tipos'"),
  objective_guess: z
    .string()
    .nullable()
    .describe("Best-guess curriculum objective in plain language, or null if unclear"),
  key_terms: z.array(z.string()).describe("Vocabulary/terms surfaced in this segment"),
  transcript_summary: z.string().describe("1-3 sentence summary of what was just taught"),
  confidence: z.number().min(0).max(1),
  evidence: z.object({
    quoted_phrases: z.array(z.string()).describe("Short verbatim phrases supporting the guess"),
    reason: z.string().describe("Why the model believes this is the topic/objective"),
  }),
});

export type LessonState = z.infer<typeof lessonStateSchema>;
