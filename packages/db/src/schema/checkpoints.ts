import { boolean, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sessions } from "./sessions.js";

/**
 * One row per checkpoint evaluation. The checkpoint agent (OpenAI, see
 * apps/worker/src/checkpoint/evaluateCheckpoint.ts) decides whether the
 * lesson_state material accumulated since the last `ready` checkpoint is
 * sufficient and valid to move from Understand to Propose. `ready = false`
 * rows mean the worker keeps accumulating more segments before re-checking.
 */
export const checkpoints = pgTable("checkpoints", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  ready: boolean("ready").notNull(),
  reason: text("reason").notNull(),
  summary: text("summary").notNull(),
  /** Snapshot of the SessionContext (@kobi/activities) considered for this decision. */
  sessionContext: jsonb("session_context").notNull(),
  segmentIds: jsonb("segment_ids").notNull().default([]),
  latestLessonState: jsonb("latest_lesson_state"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
