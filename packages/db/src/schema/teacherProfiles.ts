import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * id mirrors Supabase auth.users.id (magic-link teacher accounts). Supabase Auth
 * owns the actual credential row in the `auth` schema; Drizzle only manages this
 * profile row, so there's no cross-schema FK constraint, just a matching UUID.
 */
export const teacherProfiles = pgTable("teacher_profiles", {
  id: uuid("id").primaryKey(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
