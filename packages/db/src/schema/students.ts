import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { classes } from "./classes.js";

/** Join code + display name only — no Supabase Auth row (D6/auth-lite: no student accounts). */
export const students = pgTable("students", {
  id: uuid("id").primaryKey().defaultRandom(),
  classId: uuid("class_id")
    .notNull()
    .references(() => classes.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  accessToken: text("access_token").notNull().default(sql`replace(gen_random_uuid()::text, '-', '')`),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});
