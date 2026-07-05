import { integer, jsonb, pgTable, real, text, timestamp, uuid, vector } from "drizzle-orm/pg-core";
import { activitySourceEnum } from "./enums.js";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * The repository (D2, revised): every activity is one of the three verified
 * HTML artifact families, stored as a bundle reference (`bundleRef`) paired
 * with a schema-validated JSON manifest. Area C owns the manifest internals;
 * this table only reserves the storage columns.
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
