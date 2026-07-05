import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { students } from "./students.js";

/** Teacher-editable student notes. Difficulty is assigned per session, not stored here. */
export const studentProfiles = pgTable("student_profiles", {
  studentId: uuid("student_id")
    .primaryKey()
    .references(() => students.id, { onDelete: "cascade" }),
  modalityPref: text("modality_pref"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
