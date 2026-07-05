import { index, pgTable, real, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { assignmentStatusEnum, bandEnum } from "./enums.js";
import { activities } from "./activities.js";
import { sessionActivityCandidates } from "./sessionActivityCandidates.js";
import { sessions } from "./sessions.js";
import { students } from "./students.js";

/** One delivered activity per student per session. Defaults to core unless teacher overrides. */
export const assignments = pgTable(
  "assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id").references(() => sessionActivityCandidates.id, {
      onDelete: "set null",
    }),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    variant: bandEnum("variant").notNull().default("core"),
    status: assignmentStatusEnum("status").notNull().default("assigned"),
    score: real("score"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    unique("assignments_session_student_unique").on(table.sessionId, table.studentId),
    index("assignments_session_student_idx").on(table.sessionId, table.studentId),
  ],
);
