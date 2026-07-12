import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { activities } from "./activities.js";
import { activitySourceEnum, bandEnum, sessionActivityCandidateStatusEnum } from "./enums.js";
import { sessions } from "./sessions.js";

/**
 * Candidate artifacts shown to the teacher for one session.
 *
 * The teacher may approve support/challenge for selected students; everyone
 * without an override receives the approved core candidate by default.
 */
export const sessionActivityCandidates = pgTable(
  "session_activity_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    candidateSetVersion: uuid("candidate_set_version").notNull().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    difficultyBand: bandEnum("difficulty_band").notNull(),
    status: sessionActivityCandidateStatusEnum("status").notNull().default("ready"),
    source: activitySourceEnum("source").notNull(),
    contextSnapshot: jsonb("context_snapshot").notNull(),
    evidence: jsonb("evidence").notNull().default(sql`'[]'::jsonb`),
    verifierScores: jsonb("verifier_scores").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
  },
  (table) => [
    index("session_activity_candidates_latest_idx").on(
      table.sessionId,
      table.difficultyBand,
      table.status,
      table.createdAt,
    ),
  ],
);
