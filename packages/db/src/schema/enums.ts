import { pgEnum } from "drizzle-orm/pg-core/columns/enum";

export const sessionStatusEnum = pgEnum("session_status", ["active", "ended"]);
export const audioChunkStatusEnum = pgEnum("audio_chunk_status", [
  "pending",
  "transcribing",
  "transcribed",
  "failed",
]);
export const bandEnum = pgEnum("band", ["support", "core", "challenge"]);
export const activitySourceEnum = pgEnum("activity_source", ["seeded", "reused", "adapted", "new"]);
export const activityStatusEnum = pgEnum("activity_status", [
  "candidate",
  "verified",
  "rejected",
  "superseded",
]);
export const sessionActivityCandidateStatusEnum = pgEnum("session_activity_candidate_status", [
  "ready",
  "approved",
  "rejected",
  "superseded",
]);
export const assignmentStatusEnum = pgEnum("assignment_status", [
  "assigned",
  "in_progress",
  "completed",
]);
export const eventTypeEnum = pgEnum("event_type", ["attempt", "hint", "complete"]);
export const curriculumSourceStatusEnum = pgEnum("curriculum_source_status", [
  "pending_upload",
  "uploaded",
  "processing",
  "ready",
  "failed",
  "superseded",
]);
