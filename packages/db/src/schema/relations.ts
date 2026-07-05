import { relations } from "drizzle-orm";
import { teacherProfiles } from "./teacherProfiles.js";
import { classes } from "./classes.js";
import { students } from "./students.js";
import { studentProfiles } from "./studentProfiles.js";
import { sessions } from "./sessions.js";
import { audioChunks } from "./audioChunks.js";
import { segments } from "./segments.js";
import { activities } from "./activities.js";
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
}));

export const audioChunksRelations = relations(audioChunks, ({ one }) => ({
  session: one(sessions, { fields: [audioChunks.sessionId], references: [sessions.id] }),
}));

export const segmentsRelations = relations(segments, ({ one }) => ({
  session: one(sessions, { fields: [segments.sessionId], references: [sessions.id] }),
}));

export const activitiesRelations = relations(activities, ({ one, many }) => ({
  parent: one(activities, { fields: [activities.parentId], references: [activities.id] }),
  assignments: many(assignments),
}));

export const assignmentsRelations = relations(assignments, ({ one, many }) => ({
  activity: one(activities, { fields: [assignments.activityId], references: [activities.id] }),
  student: one(students, { fields: [assignments.studentId], references: [students.id] }),
  events: many(events),
}));

export const eventsRelations = relations(events, ({ one }) => ({
  assignment: one(assignments, { fields: [events.assignmentId], references: [assignments.id] }),
}));
