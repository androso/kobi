# Persist Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist recorded sessions in `localStorage` using Zustand's `persist` middleware, and ensure they are keyed/filtered by the active teacher's ID so that reloading does not delete them, and teachers don't see each other's sessions.

**Architecture:**
- Update `store.ts` to:
  - Add `teacherId` property to the `SavedSession` interface.
  - Wrap `useClassStore` with Zustand's `persist` middleware to save and restore `sessions` state under the key `"kobi-class-store"`.
- Update `LiveClassMonitor.tsx` to:
  - Pass the current teacher's ID when building a session via `buildSession`.
- Update `PreviousClasses.tsx` to:
  - Filter `storeSessions` by the current logged-in teacher's ID (`s.teacherId === teacherId`), maintaining fallback support for any unkeyed sessions.

**Tech Stack:** React, Zustand, Vitest

---

### Task 1: Update store.ts to persist sessions
**Files:**
- Modify: `apps/web/src/lib/store.ts`

- [ ] **Step 1: Update SavedSession interface**
  Add `teacherId` field (around lines 280-294):
  ```typescript
  export interface SavedSession {
    id: string;
    classId: string;
    subject: string;
    subjectColor: string;
    dotColor: string;
    title: string;
    focus: string;
    date: string;
    duration: string;
    summaryPoints: string[];
    nextSteps: string[];
    transcript: SessionTranscriptLine[];
    teacherId?: string; // Added field
  }
  ```

- [ ] **Step 2: Add persist middleware to useClassStore**
  Import `persist` from `"zustand/middleware"` and wrap `useClassStore` (around line 604):
  ```typescript
  import { persist } from "zustand/middleware";
  ```
  ```typescript
  export const useClassStore = create<ClassState>()(
    persist(
      (set) => ({
        classes: defaultClasses,
        loadingClasses: false,
        classError: null,
        monitoringClassId: null,
        sessions: [],
        artefactos: defaultArtefactos,
        submissions: [],
        ...
      }),
      {
        name: "kobi-class-store",
        partialize: (state) => ({ sessions: state.sessions }),
      }
    )
  );
  ```

---

### Task 2: Update LiveClassMonitor.tsx to record teacherId
**Files:**
- Modify: `apps/web/src/features/teacher/LiveClassMonitor.tsx`

- [ ] **Step 1: Update buildSession signature & result**
  Accept `teacherId` argument and include it in return object:
  ```typescript
  function buildSession(cls: ClassItem, durationSeconds: number, teacherId?: string): SavedSession {
    ...
    return {
      ...
      teacherId,
    };
  }
  ```

- [ ] **Step 2: Import useAuthStore and pass teacher ID**
  Import `useAuthStore` at the top of the file:
  ```typescript
  import { useAuthStore, useClassStore, type SavedSession, type ClassItem } from "../../lib/store";
  ```
  And inside `stopRecording` function, pass the active teacher's user ID:
  ```typescript
  if (monitoringClass) {
    const teacherId = useAuthStore.getState().user?.id;
    const session = buildSession(monitoringClass, elapsed, teacherId);
    endSession(session);
    setFinishedSession(session);
  }
  ```

---

### Task 3: Filter sessions by teacherId in PreviousClasses.tsx
**Files:**
- Modify: `apps/web/src/features/teacher/PreviousClasses.tsx`

- [ ] **Step 1: Filter session lists by current teacher**
  Filter the store's sessions list to only include current teacher's sessions (around line 118):
  ```typescript
  // Sessions saved live from the monitor appear first, then the seed history (only for mock teacher)
  const storeSessions = useClassStore((state) => state.sessions);
  const teacherId = user?.id;
  const currentTeacherSessions = storeSessions.filter(
    (s) => !s.teacherId || s.teacherId === teacherId
  );
  const isMockTeacher = user?.email === "maestra@kobi.test";
  const allSessions = isMockTeacher
    ? [...currentTeacherSessions, ...PREVIOUS_SESSIONS]
    : currentTeacherSessions;
  ```

---

### Task 4: Verify & Test
**Files:**
- None

- [ ] **Step 1: Run Vitest tests**
  Run: `pnpm --filter @kobi/web test`
  Expected: All 15 tests pass.
