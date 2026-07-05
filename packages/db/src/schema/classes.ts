import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { teacherProfiles } from "./teacherProfiles.js";

/** v0: one class = one grade/subject/unit (D1: 7th-grade Lenguaje). */
export const classes = pgTable("classes", {
  id: uuid("id").primaryKey().defaultRandom(),
  teacherId: uuid("teacher_id")
    .notNull()
    .references(() => teacherProfiles.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  joinCode: text("join_code").notNull().unique(),
  grade: integer("grade").notNull(),
  subject: text("subject").notNull(),
  unit: text("unit").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
