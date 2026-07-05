import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { bandEnum } from "./enums.js";
import { students } from "./students.js";

/** Pedagogical band, teacher-editable (D4: banding, not deep learner modeling). */
export const studentProfiles = pgTable("student_profiles", {
  studentId: uuid("student_id")
    .primaryKey()
    .references(() => students.id, { onDelete: "cascade" }),
  band: bandEnum("band").notNull().default("core"),
  modalityPref: text("modality_pref"),
  notes: text("notes"),
});
