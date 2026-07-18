import { pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { classes } from "./classes.js";
import { curriculumSources } from "./curriculumSources.js";
import { teacherProfiles } from "./teacherProfiles.js";

/** Shared curriculum sources explicitly enabled for a class. */
export const curriculumSourceSelections = pgTable(
  "curriculum_source_selections",
  {
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => curriculumSources.id, { onDelete: "cascade" }),
    selectedBy: uuid("selected_by").references(() => teacherProfiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.classId, table.sourceId] })],
);
