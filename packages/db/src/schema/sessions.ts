import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { sessionStatusEnum } from "./enums.js";
import { classes } from "./classes.js";

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  classId: uuid("class_id")
    .notNull()
    .references(() => classes.id, { onDelete: "cascade" }),
  status: sessionStatusEnum("status").notNull().default("active"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});
