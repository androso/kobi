import { pgTable, real, timestamp, uuid } from "drizzle-orm/pg-core";
import { assignmentStatusEnum, bandEnum } from "./enums.js";
import { activities } from "./activities.js";
import { students } from "./students.js";

/** activity x student x variant. */
export const assignments = pgTable("assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  activityId: uuid("activity_id")
    .notNull()
    .references(() => activities.id, { onDelete: "cascade" }),
  studentId: uuid("student_id")
    .notNull()
    .references(() => students.id, { onDelete: "cascade" }),
  variant: bandEnum("variant").notNull(),
  status: assignmentStatusEnum("status").notNull().default("assigned"),
  score: real("score"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});
