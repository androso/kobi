import { integer, jsonb, pgTable, real, text, timestamp, uuid, vector } from "drizzle-orm/pg-core";
import { activitySourceEnum } from "./enums.js";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * The repository (D2, revised): every activity is a generated-code artifact
 * (`bundleRef`) paired with a schema-validated JSON manifest (curriculum tags,
 * answer key, hints, est_minutes, variants). The manifest's internal shape is
 * Area C's (Androso's) design call — see docs/area-bc-contract.md — this
 * table only reserves the column.
 */
export const activities = pgTable("activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  bundleRef: text("bundle_ref").notNull(),
  manifest: jsonb("manifest").notNull(),
  embedding: vector("embedding", { dimensions: 768 }),
  source: activitySourceEnum("source").notNull(),
  verifierScores: jsonb("verifier_scores"),
  timesUsed: integer("times_used").notNull().default(0),
  avgScore: real("avg_score"),
  parentId: uuid("parent_id").references((): AnyPgColumn => activities.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
