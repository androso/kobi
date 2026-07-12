import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sessions } from "./sessions.js";

export const retentionDeletionAttempts = pgTable("retention_deletion_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "set null" }),
  reason: text("reason").notNull(),
  status: text("status").notNull(),
  errorCategory: text("error_category"),
  result: jsonb("result"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});
