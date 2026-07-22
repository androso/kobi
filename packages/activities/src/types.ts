import { z } from "zod";

export const ACTIVITY_ARTIFACT_CONTRACT_VERSION = "activity-artifact/v1" as const;
export const ACTIVITY_SDK_VERSION = "activity-sdk/v1" as const;

export const activityFamilySchema = z.enum([
  "match_classify",
  "sequence_order",
  "guided_practice",
]);

export const difficultyBandSchema = z.enum(["support", "core", "challenge"]);
export const activitySourceSchema = z.enum(["seeded", "reused", "adapted", "new"]);
export const activityMechanicSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/,
    "mechanic must be a snake_case slug",
  );

export const learningDesignSchema = z.object({
  learning_goal: z.string().min(1),
  interaction_summary: z.string().min(1),
  success_criteria: z.array(z.string().min(1)).min(1).max(5),
});

export const visualThemeSchema = z.object({
  scene: z.string().min(1),
  accent: z.string().min(1),
});

export const activityCapabilitySchema = z.enum(["dom", "css", "svg", "canvas"]);
export const activityTelemetryEventTypeSchema = z.enum(["attempt", "hint", "complete"]);

export const activityCurriculumSchema = z.object({
  grade: z.number().int().positive(),
  subject: z.string().min(1),
  unit: z.string().min(1),
  objective: z.string().min(1),
});

export const activityContentItemSchema = z.object({
  prompt: z.string().min(1),
  answer_key: z.array(z.string().min(1)).min(1),
  hints: z.array(z.string().min(1)).default([]),
});

export const activityManifestSchema = z.object({
  family: activityFamilySchema,
  mechanic: activityMechanicSchema.optional(),
  title: z.string().min(3),
  difficulty_band: difficultyBandSchema,
  curriculum: activityCurriculumSchema,
  est_minutes: z.number().int().min(3).max(12),
  content: z.object({
    items: z.array(activityContentItemSchema).min(1).max(8),
    telemetry_events: z.array(activityTelemetryEventTypeSchema).min(1).max(3).optional(),
  }),
  entry: z.literal("index.html"),
  sdk_version: z.literal(ACTIVITY_SDK_VERSION),
  allowed_capabilities: z.array(activityCapabilitySchema).min(1),
  learning_design: learningDesignSchema.optional(),
  visual_theme: visualThemeSchema.optional(),
});

export const activityEvidenceSchema = z.object({
  objective_code: z.string().min(1),
  section: z.string().min(1),
  text: z.string().min(1),
  similarity: z.number().min(0).max(1).optional(),
});

export const activityRubricScoresSchema = z.object({
  curriculum_alignment: z.number().min(0).max(1),
  age_fit: z.number().min(0).max(1),
  duration_fit: z.number().min(0).max(1),
  answer_correctness: z.number().min(0).max(1),
  hint_leakage: z.number().min(0).max(1),
  duplicate_risk: z.number().min(0).max(1),
  spanish_suitability: z.number().min(0).max(1),
  gamefulness: z.number().min(0).max(1).optional(),
  interaction_quality: z.number().min(0).max(1).optional(),
  visual_coherence: z.number().min(0).max(1).optional(),
  accessibility: z.number().min(0).max(1).optional(),
  band_coherence: z.number().min(0).max(1).optional(),
});

export const activityVerifierScoresSchema = z.object({
  deterministic: z.enum(["pass", "fail"]),
  rubric: activityRubricScoresSchema,
  errors: z.array(z.string()).optional(),
});

export const activityArtifactSchema = z.object({
  contract_version: z.literal(ACTIVITY_ARTIFACT_CONTRACT_VERSION),
  manifest: activityManifestSchema,
  bundle_ref: z.string().min(1),
  verifier_scores: activityVerifierScoresSchema,
  evidence: z.array(activityEvidenceSchema).min(1),
  parent_id: z.string().nullable().optional(),
  activity_set_id: z.string().nullable().optional(),
  status: z.enum(["candidate", "verified", "rejected", "superseded"]),
});

export const activityArtifactCandidateSchema = activityArtifactSchema.extend({
  bundle_html: z.string().min(1),
});

export type ActivityFamily = z.infer<typeof activityFamilySchema>;
export type ActivityMechanic = z.infer<typeof activityMechanicSchema>;
export type LearningDesign = z.infer<typeof learningDesignSchema>;
export type VisualTheme = z.infer<typeof visualThemeSchema>;
export type DifficultyBand = z.infer<typeof difficultyBandSchema>;
export type ActivitySource = z.infer<typeof activitySourceSchema>;
export type ActivityCapability = z.infer<typeof activityCapabilitySchema>;
export type ActivityTelemetryEventType = z.infer<typeof activityTelemetryEventTypeSchema>;
export type ActivityCurriculum = z.infer<typeof activityCurriculumSchema>;
export type ActivityContentItem = z.infer<typeof activityContentItemSchema>;
export type ActivityManifest = z.infer<typeof activityManifestSchema>;
export type ActivityEvidence = z.infer<typeof activityEvidenceSchema>;
export type ActivityRubricScores = z.infer<typeof activityRubricScoresSchema>;
export type ActivityVerifierScores = z.infer<typeof activityVerifierScoresSchema>;
export type ActivityArtifact = z.infer<typeof activityArtifactSchema>;
export type ActivityArtifactCandidate = z.infer<typeof activityArtifactCandidateSchema>;

export interface SessionContext {
  latest_topic: string;
  latest_objective: string | null;
  vocabulary: string[];
  examples_used: string[];
  misconceptions: string[];
  time_remaining_minutes: number | null;
  confidence: number;
  segment_count: number;
}

export const activitySdkRequestSchema = z.object({
  sdk: z.literal(ACTIVITY_SDK_VERSION),
  type: z.literal("request"),
  id: z.string().min(1),
  method: z.enum(["getManifest", "getBand"]),
});

export const activityAttemptPayloadSchema = z.object({
  assignment_id: z.string().min(1),
  item_index: z.number().int().nonnegative(),
  correct: z.boolean(),
  answer: z.unknown().optional(),
});

export const activityHintPayloadSchema = z.object({
  assignment_id: z.string().min(1),
  item_index: z.number().int().nonnegative(),
  hint_index: z.number().int().nonnegative(),
});

export const activityCompletePayloadSchema = z
  .object({
    assignment_id: z.string().min(1),
    score_unit: z.enum(["count", "normalized"]).optional(),
    score: z.number().finite().min(0),
    total: z.number().finite().positive().optional(),
    completed_at: z.string().datetime().optional(),
  })
  .superRefine((payload, ctx) => {
    const scoreUnit = payload.score_unit ?? (payload.total === undefined ? "normalized" : "count");

    if (scoreUnit === "normalized" && payload.total !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["total"],
        message: "total must be omitted for normalized scores",
      });
    }

    if (scoreUnit === "normalized" && payload.score > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["score"],
        message: "normalized score must be between 0 and 1",
      });
    }

    if (scoreUnit === "count" && payload.total === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["total"],
        message: "total is required for count scores",
      });
    }

    if (scoreUnit === "count" && !Number.isInteger(payload.score)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["score"],
        message: "count score must be an integer",
      });
    }

    if (scoreUnit === "count" && payload.total !== undefined && !Number.isInteger(payload.total)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["total"],
        message: "count total must be an integer",
      });
    }

    if (scoreUnit === "count" && payload.total !== undefined && payload.score > payload.total) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["score"],
        message: "count score cannot exceed total",
      });
    }
  });

export const activitySdkEventSchema = z.discriminatedUnion("method", [
  z.object({
    sdk: z.literal(ACTIVITY_SDK_VERSION),
    type: z.literal("event"),
    method: z.literal("reportAttempt"),
    payload: activityAttemptPayloadSchema,
  }),
  z.object({
    sdk: z.literal(ACTIVITY_SDK_VERSION),
    type: z.literal("event"),
    method: z.literal("reportHint"),
    payload: activityHintPayloadSchema,
  }),
  z.object({
    sdk: z.literal(ACTIVITY_SDK_VERSION),
    type: z.literal("event"),
    method: z.literal("reportComplete"),
    payload: activityCompletePayloadSchema,
  }),
]);

export const activitySdkMessageSchema = z.union([activitySdkRequestSchema, activitySdkEventSchema]);

export type ActivitySdkRequest = z.infer<typeof activitySdkRequestSchema>;
export type ActivityAttemptPayload = z.infer<typeof activityAttemptPayloadSchema>;
export type ActivityHintPayload = z.infer<typeof activityHintPayloadSchema>;
export type ActivityCompletePayload = z.infer<typeof activityCompletePayloadSchema>;
export type ActivitySdkEvent = z.infer<typeof activitySdkEventSchema>;
export type ActivitySdkMessage = z.infer<typeof activitySdkMessageSchema>;

export interface ActivityRepositoryRow {
  id: string;
  contract_version: typeof ACTIVITY_ARTIFACT_CONTRACT_VERSION;
  manifest: ActivityManifest;
  bundle_ref: string;
  evidence: ActivityEvidence[];
  parent_id: string | null;
  activity_set_id?: string | null;
  status: ActivityArtifact["status"];
  source: ActivitySource;
  verifier_scores: ActivityVerifierScores;
  times_used: number;
  avg_score: number | null;
}
