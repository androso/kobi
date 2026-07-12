import { check, integer, jsonb, pgTable, real, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { sessions } from "./sessions.js";

/** Rolling lesson_state snapshots, built from 1-2 chunks of transcript at a time. */
export const segments = pgTable(
  "segments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    fromChunkIndex: integer("from_chunk_index").notNull(),
    toChunkIndex: integer("to_chunk_index").notNull(),
    lessonState: jsonb("lesson_state").notNull(),
    confidence: real("confidence").notNull(),
    transcriptSummary: text("transcript_summary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique().on(table.sessionId, table.fromChunkIndex, table.toChunkIndex),
    check("segments_chunk_range_valid", sql`${table.fromChunkIndex} <= ${table.toChunkIndex}`),
  ],
);
