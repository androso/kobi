import { relations } from "drizzle-orm";
import { teacherProfiles } from "./teacherProfiles.js";
import { classes } from "./classes.js";
import { students } from "./students.js";
import { studentProfiles } from "./studentProfiles.js";
import { sessions } from "./sessions.js";
import { audioChunks } from "./audioChunks.js";
import { segments } from "./segments.js";
import { activityBundles } from "./activityBundles.js";
import { activities } from "./activities.js";
import { sessionActivityCandidates } from "./sessionActivityCandidates.js";
import { assignments } from "./assignments.js";
import { events } from "./events.js";

export const teacherProfilesRelations = relations(teacherProfiles, ({ many }) => ({
  classes: many(classes),
}));

export const classesRelations = relations(classes, ({ one, many }) => ({
  teacher: one(teacherProfiles, {
    fields: [classes.teacherId],
    references: [teacherProfiles.id],
  }),
  students: many(students),
  sessions: many(sessions),
}));

export const studentsRelations = relations(students, ({ one, many }) => ({
  class: one(classes, { fields: [students.classId], references: [classes.id] }),
  profile: one(studentProfiles, {
    fields: [students.id],
    references: [studentProfiles.studentId],
  }),
  assignments: many(assignments),
}));

export const studentProfilesRelations = relations(studentProfiles, ({ one }) => ({
  student: one(students, { fields: [studentProfiles.studentId], references: [students.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  class: one(classes, { fields: [sessions.classId], references: [classes.id] }),
  audioChunks: many(audioChunks),
  segments: many(segments),
  activityCandidates: many(sessionActivityCandidates),
  assignments: many(assignments),
}));

export const audioChunksRelations = relations(audioChunks, ({ one }) => ({
  session: one(sessions, { fields: [audioChunks.sessionId], references: [sessions.id] }),
}));

export const segmentsRelations = relations(segments, ({ one }) => ({
  session: one(sessions, { fields: [segments.sessionId], references: [sessions.id] }),
}));

export const activityBundlesRelations = relations(activityBundles, ({ many }) => ({
  activities: many(activities),
}));

export const activitiesRelations = relations(activities, ({ one, many }) => ({
  bundle: one(activityBundles, {
    fields: [activities.bundleRef],
    references: [activityBundles.ref],
  }),
  parent: one(activities, { fields: [activities.parentId], references: [activities.id] }),
  sessionCandidates: many(sessionActivityCandidates),
  assignments: many(assignments),
}));

export const sessionActivityCandidatesRelations = relations(
  sessionActivityCandidates,
  ({ one, many }) => ({
    session: one(sessions, {
      fields: [sessionActivityCandidates.sessionId],
      references: [sessions.id],
    }),
    activity: one(activities, {
      fields: [sessionActivityCandidates.activityId],
      references: [activities.id],
    }),
    assignments: many(assignments),
  }),
);

export const assignmentsRelations = relations(assignments, ({ one, many }) => ({
  session: one(sessions, { fields: [assignments.sessionId], references: [sessions.id] }),
  candidate: one(sessionActivityCandidates, {
    fields: [assignments.candidateId],
    references: [sessionActivityCandidates.id],
  }),
  activity: one(activities, { fields: [assignments.activityId], references: [activities.id] }),
  student: one(students, { fields: [assignments.studentId], references: [students.id] }),
  events: many(events),
}));

export const eventsRelations = relations(events, ({ one }) => ({
  assignment: one(assignments, { fields: [events.assignmentId], references: [assignments.id] }),
}));
