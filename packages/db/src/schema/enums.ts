import { pgEnum } from "drizzle-orm/pg-core";

export const sessionStatusEnum = pgEnum("session_status", ["active", "ended"]);
export const audioChunkStatusEnum = pgEnum("audio_chunk_status", [
  "pending",
  "transcribing",
  "transcribed",
  "failed",
]);
export const bandEnum = pgEnum("band", ["support", "core", "challenge"]);
export const activitySourceEnum = pgEnum("activity_source", ["reused", "new"]);
export const assignmentStatusEnum = pgEnum("assignment_status", [
  "assigned",
  "in_progress",
  "completed",
]);
export const eventTypeEnum = pgEnum("event_type", ["attempt", "hint", "complete"]);
