# Dynamic Previous Classes Headers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the teacher's name dynamic in the "Previous Classes" historical details modal.

**Architecture:**
- Import `useAuthStore` in `PreviousClasses.tsx`.
- Retrieve `displayName` (or fallback) from the store.
- Replace the hardcoded `Sra. Henderson` metadata labels with the dynamic `teacherName`.

**Tech Stack:** React, Vitest

---

### Task 1: Update PreviousClasses.tsx imports & render
**Files:**
- Modify: `apps/web/src/features/teacher/PreviousClasses.tsx`

- [ ] **Step 1: Import useAuthStore**
  Update imports:
  ```typescript
  import { useClassStore, useAuthStore, type SavedSession } from "../../lib/store";
  ```

- [ ] **Step 2: Read teacherName inside PreviousClasses component**
  ```typescript
  const user = useAuthStore((state) => state.user);
  const teacherName = user?.displayName || user?.email?.split("@")[0] || "Docente";
  ```

- [ ] **Step 3: Update occurrences of Sra. Henderson with teacherName**
  In the detail rendering blocks, change `Sra. Henderson` to `{teacherName}`:
  ```tsx
  {/* Line 323 */}
  <p className="text-xs text-slate-500 mt-0.5 font-medium">
    {teacherName} · {selectedSession.duration}
  </p>
  ```
  And:
  ```tsx
  {/* Line 415 */}
  <p className="text-xs text-slate-400 font-medium mt-0.5">
    {teacherName} · {selectedSession.duration}
  </p>
  ```

---

### Task 2: Verify & Test
**Files:**
- None

- [ ] **Step 1: Run Vitest tests**
  Run: `pnpm --filter @kobi/web test`
  Expected: All 15 tests pass.
