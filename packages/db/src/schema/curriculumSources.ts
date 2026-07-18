import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { curriculumSourceStatusEnum } from "./enums.js";
import { classes } from "./classes.js";
import { teacherProfiles } from "./teacherProfiles.js";

/** Teacher-uploaded curriculum material for a class (Area B ingest pipeline). */
export const curriculumSources = pgTable("curriculum_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  originClassId: uuid("origin_class_id").references(() => classes.id, { onDelete: "set null" }),
  uploadedBy: uuid("uploaded_by").references(() => teacherProfiles.id, { onDelete: "set null" }),
  grade: integer("grade").notNull(),
  subject: text("subject").notNull(),
  unit: text("unit").notNull(),
  sourceDocument: text("source_document").notNull(),
  originalFilename: text("original_filename").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  storagePath: text("storage_path").notNull(),
  status: curriculumSourceStatusEnum("status").notNull().default("pending_upload"),
  errorMessage: text("error_message"),
  pageCount: integer("page_count"),
  chunksBuilt: integer("chunks_built"),
  storageDeletedAt: timestamp("storage_deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
