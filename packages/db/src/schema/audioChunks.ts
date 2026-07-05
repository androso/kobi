import { integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { audioChunkStatusEnum } from "./enums.js";
import { sessions } from "./sessions.js";

/** One row per ~45-60s audio chunk uploaded from the teacher's mic. */
export const audioChunks = pgTable(
  "audio_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    storagePath: text("storage_path").notNull(),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    status: audioChunkStatusEnum("status").notNull().default("pending"),
    transcriptText: text("transcript_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.sessionId, table.chunkIndex)],
);
