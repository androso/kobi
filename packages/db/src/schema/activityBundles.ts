import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Self-contained verified HTML bundles addressed by unguessable refs. */
export const activityBundles = pgTable("activity_bundles", {
  ref: text("ref").primaryKey(),
  indexHtml: text("index_html").notNull(),
  checksum: text("checksum").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
