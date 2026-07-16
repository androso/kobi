import { index, integer, pgTable, text, timestamp, uuid, vector } from "drizzle-orm/pg-core";
import { classes } from "./classes.js";
import { curriculumSources } from "./curriculumSources.js";

/** Textbook/unit chunks embedded for retrieval (teacher-fed or seeded). */
export const curriculumChunks = pgTable(
  "curriculum_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id").references(() => curriculumSources.id, { onDelete: "cascade" }),
    classId: uuid("class_id").references(() => classes.id, { onDelete: "cascade" }),
    grade: integer("grade").notNull(),
    subject: text("subject").notNull(),
    unit: text("unit").notNull(),
    objectiveCode: text("objective_code").notNull(),
    text: text("text").notNull(),
    embedding: vector("embedding", { dimensions: 768 }),
    sourceDocument: text("source_document"),
    sourcePageStart: integer("source_page_start"),
    sourcePageEnd: integer("source_page_end"),
    sectionTitle: text("section_title"),
    chunkIndex: integer("chunk_index"),
    contentHash: text("content_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("curriculum_chunks_filters_idx").on(table.grade, table.subject, table.unit),
    index("curriculum_chunks_class_idx").on(table.classId),
    index("curriculum_chunks_source_id_idx").on(table.sourceId),
    index("curriculum_chunks_source_idx").on(table.sourceDocument, table.sourcePageStart),
    // ivfflat vector index isn't expressible via drizzle-kit; created in
    // migrations/0002_vector_extras.sql instead (see packages/db/README.md).
  ],
);
