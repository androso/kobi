import { jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { eventTypeEnum } from "./enums.js";
import { assignments } from "./assignments.js";

/** Telemetry: written on every student interaction. */
export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  assignmentId: uuid("assignment_id")
    .notNull()
    .references(() => assignments.id, { onDelete: "cascade" }),
  type: eventTypeEnum("type").notNull(),
  payload: jsonb("payload").notNull(),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
});
