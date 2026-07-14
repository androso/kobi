import { sql } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { classes } from "./classes.js";

/** Teacher-provisioned student identity. Rows without authUserId are historical. */
export const students = pgTable("students", {
  id: uuid("id").primaryKey().defaultRandom(),
  classId: uuid("class_id")
    .notNull()
    .references(() => classes.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  username: text("username"),
  authUserId: uuid("auth_user_id"),
  isActive: boolean("is_active").notNull().default(false),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  accessToken: text("access_token").default(sql`replace(gen_random_uuid()::text, '-', '')`),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  usernameUnique: uniqueIndex("students_username_unique").on(table.username),
  authUserUnique: uniqueIndex("students_auth_user_id_unique").on(table.authUserId),
}));
