# Remove Fake Dashboard Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove fake hardcoded engagement/weekly metrics from the teacher dashboard and dynamic avatar stacks from class cards when there are no recorded classes or students.

**Architecture:**
- Update `ClassCard.tsx` to:
  - Dynamically render the student avatar stack based on the actual class `studentCount` instead of the hardcoded `S P M +19` list.
  - Hide the "Temas clave" section if the class has no key topics assigned.
- Update `TeacherDashboard.tsx` to:
  - Retrieve `sessions` from `useClassStore`.
  - Only display the bottom stats/engagement cards if the teacher has actually recorded sessions (`sessions.length > 0`).

**Tech Stack:** React, Zustand, Vitest

---

### Task 1: Update ClassCard.tsx dynamic display
**Files:**
- Modify: `apps/web/src/features/teacher/components/ClassCard.tsx`

- [ ] **Step 1: Make avatar stack dynamic**
  Replace the hardcoded avatar list (lines 173-179) with a list dynamically scaled to `item.studentCount`:
  ```tsx
  {/* Avatar stack overlay */}
  {item.studentCount > 0 ? (
    <div className="flex -space-x-1.5 overflow-hidden">
      <span className={`inline-block h-6 w-6 rounded-full border border-white flex items-center justify-center text-[9px] font-bold ${theme.avatarBg[0]}`}>E</span>
      {item.studentCount > 1 && (
        <span className={`inline-block h-6 w-6 rounded-full border border-white flex items-center justify-center text-[9px] font-bold ${theme.avatarBg[1]}`}>E</span>
      )}
      {item.studentCount > 2 && (
        <span className={`inline-block h-6 w-6 rounded-full border border-white flex items-center justify-center text-[9px] font-bold ${theme.avatarBg[2]}`}>E</span>
      )}
      {item.studentCount > 3 && (
        <span className="inline-block h-6 w-6 rounded-full border border-white bg-slate-100 flex items-center justify-center text-[8px] font-extrabold text-slate-500">
          +{item.studentCount - 3}
        </span>
      )}
    </div>
  ) : null}
  ```

- [ ] **Step 2: Conditional rendering of Topics List**
  Only render the topics container if `item.topics` contains items (lines 154-164):
  ```tsx
  {/* Topics List */}
  {item.topics && item.topics.length > 0 ? (
    <div className="mt-5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">Temas clave</p>
      <div className="flex flex-wrap gap-1.5">
        {item.topics.map((topic) => (
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors duration-300 ${theme.bg}`} key={topic}>
            {topic}
          </span>
        ))}
      </div>
    </div>
  ) : null}
  ```

---

### Task 2: Hide Bottom Quick Stats on TeacherDashboard
**Files:**
- Modify: `apps/web/src/features/teacher/TeacherDashboard.tsx`

- [ ] **Step 1: Read sessions state in TeacherDashboard**
  Retrieve `sessions` from the class store:
  ```typescript
  const sessions = useClassStore((state) => state.sessions);
  ```

- [ ] **Step 2: Wrap Bottom Quick Stats container**
  Conditionally render the bottom stats block:
  ```tsx
  {/* Bottom Quick Stats / Activity */}
  {sessions.length > 0 ? (
    <section className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Engagement Insight Card */}
      ...
    </section>
  ) : null}
  ```

---

### Task 3: Verify & Test
**Files:**
- None

- [ ] **Step 1: Run Vitest tests**
  Run: `pnpm --filter @kobi/web test`
  Expected: All 15 tests pass.
