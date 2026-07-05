import type {
  teacherProfiles,
  classes,
  students,
  studentProfiles,
  sessions,
  audioChunks,
  segments,
  curriculumChunks,
  activities,
  assignments,
  events,
} from "./schema/index.js";

export type TeacherProfile = typeof teacherProfiles.$inferSelect;
export type Class = typeof classes.$inferSelect;
export type Student = typeof students.$inferSelect;
export type StudentProfile = typeof studentProfiles.$inferSelect;

export type Session = typeof sessions.$inferSelect;
export type AudioChunk = typeof audioChunks.$inferSelect;
export type AudioChunkStatus = AudioChunk["status"];
export type Segment = typeof segments.$inferSelect;

/** @deprecated use `CurriculumChunk` — kept for the pre-Drizzle name used by packages/curriculum. */
export type CurriculumChunkRow = typeof curriculumChunks.$inferSelect;
export type CurriculumChunk = typeof curriculumChunks.$inferSelect;

export type Activity = typeof activities.$inferSelect;
export type Assignment = typeof assignments.$inferSelect;
export type Event = typeof events.$inferSelect;
