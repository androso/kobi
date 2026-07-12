import { index, jsonb, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { eventTypeEnum } from "./enums.js";
import { assignments } from "./assignments.js";

/** Telemetry: written on every student interaction. */
export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull(),
  assignmentId: uuid("assignment_id")
    .notNull()
    .references(() => assignments.id, { onDelete: "cascade" }),
  type: eventTypeEnum("type").notNull(),
  payload: jsonb("payload").notNull(),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("events_assignment_event_id_unique").on(table.assignmentId, table.eventId),
  index("events_assignment_ts_idx").on(table.assignmentId, table.ts),
]);
