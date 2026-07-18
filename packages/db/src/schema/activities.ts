import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { activityBundles } from "./activityBundles.js";
import { activitySourceEnum, activityStatusEnum } from "./enums.js";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * The repository (D2, revised): every activity is one of the three verified
 * HTML artifact families, stored as a bundle reference (`bundleRef`) paired
 * with a schema-validated JSON manifest. Area C owns the manifest internals,
 * while this table keeps workflow-critical evidence/status fields queryable.
 */
export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contractVersion: text("contract_version").notNull().default("activity-artifact/v1"),
    manifest: jsonb("manifest").notNull(),
    bundleRef: text("bundle_ref")
      .notNull()
      .unique()
      .references(() => activityBundles.ref),
    evidence: jsonb("evidence").notNull().default(sql`'[]'::jsonb`),
    status: activityStatusEnum("status").notNull().default("verified"),
    embedding: vector("embedding", { dimensions: 768 }),
    curriculumTags: text("curriculum_tags").array().notNull().default(sql`'{}'::text[]`),
    source: activitySourceEnum("source").notNull().default("new"),
    verifierScores: jsonb("verifier_scores").notNull(),
    timesUsed: integer("times_used").notNull().default(0),
    avgScore: real("avg_score"),
    parentId: uuid("parent_id").references((): AnyPgColumn => activities.id),
    activitySetId: text("activity_set_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("activities_status_idx").on(table.status),
    index("activities_activity_set_idx").on(table.activitySetId),
  ],
);
