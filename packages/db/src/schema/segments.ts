import { integer, jsonb, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sessions } from "./sessions.js";

/** Rolling lesson_state snapshots, built from 1-2 chunks of transcript at a time. */
export const segments = pgTable("segments", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  lessonState: jsonb("lesson_state").notNull(),
  confidence: real("confidence").notNull(),
  transcriptSummary: text("transcript_summary").notNull(),
  sourceThroughChunkIndex: integer("source_through_chunk_index"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
