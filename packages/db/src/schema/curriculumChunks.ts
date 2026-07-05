import { index, integer, pgTable, text, timestamp, uuid, vector } from "drizzle-orm/pg-core";

/** Objective-level textbook chunks (D1: 7th-grade Lenguaje unit), embedded for retrieval. */
export const curriculumChunks = pgTable(
  "curriculum_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    grade: integer("grade").notNull(),
    subject: text("subject").notNull(),
    unit: text("unit").notNull(),
    objectiveCode: text("objective_code").notNull(),
    text: text("text").notNull(),
    embedding: vector("embedding", { dimensions: 768 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("curriculum_chunks_filters_idx").on(table.grade, table.subject, table.unit),
    // ivfflat vector index isn't expressible via drizzle-kit; created in
    // migrations/0002_vector_extras.sql instead (see packages/db/README.md).
  ],
);
