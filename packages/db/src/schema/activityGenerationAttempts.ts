import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sessions } from "./sessions.js";

export const activityGenerationAttempts = pgTable(
  "activity_generation_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    activitySetId: text("activity_set_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("activity_generation_attempts_session_set_provider_unique").on(
      table.sessionId,
      table.activitySetId,
      table.provider,
    ),
    index("activity_generation_attempts_session_provider_idx").on(
      table.sessionId,
      table.provider,
      table.createdAt,
    ),
  ],
);
