import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { checkpoints } from "./checkpoints.js";

export const checkpointGenerationOutbox = pgTable(
  "checkpoint_generation_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    checkpointId: uuid("checkpoint_id").notNull().references(() => checkpoints.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    curriculumMatches: jsonb("curriculum_matches"),
    queueJobId: text("queue_job_id"),
    lastError: text("last_error"),
    dispatchStartedAt: timestamp("dispatch_started_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    generationStartedAt: timestamp("generation_started_at", { withTimezone: true }),
    generationCompletedAt: timestamp("generation_completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({ checkpointUnique: uniqueIndex("checkpoint_generation_outbox_checkpoint_uidx").on(table.checkpointId) }),
);
