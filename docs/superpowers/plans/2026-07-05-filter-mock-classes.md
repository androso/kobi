# Filter Mock Classes from Teacher Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent hardcoded demo classes (`class-1`, `class-2`, `class-3`) and their student counts from rendering on the authenticated teacher's dashboard, while preserving the mock classes for student offline demo mode.

**Architecture:**
- Update `TeacherDashboard.tsx` to filter out demo classes (`class-1`, `class-2`, `class-3`) from the store classes list.
- Keep the `defaultClasses` in `store.ts` intact so that student demo login (with join code `KOBI7` mapping to `class-1`) works normally.

**Tech Stack:** React, Zustand, Vitest

---

### Task 1: Filter classes on TeacherDashboard
**Files:**
- Modify: `apps/web/src/features/teacher/TeacherDashboard.tsx`

- [ ] **Step 1: Filter classes in TeacherDashboard**
  Filter out `"class-1"`, `"class-2"`, `"class-3"`:
  ```typescript
  const allStoreClasses = useClassStore((state) => state.classes);
  const classes = allStoreClasses.filter(
    (c) => c.id !== "class-1" && c.id !== "class-2" && c.id !== "class-3"
  );
  ```

---

### Task 2: Update App.test.tsx mock and assertions
**Files:**
- Modify: `apps/web/src/App.test.tsx`

- [ ] **Step 1: Update App.test.tsx to assert 1 class count in tests**
  In the teacher dashboard integration tests, the mock state setup uses a single class with `id: "class-1"`. Since `"class-1"` is filtered out by our dashboard change, let's change its ID in the test class store mockup to `"class-test-1"`.
  Let's check lines 40-50 in `App.test.tsx`:
  ```typescript
    useClassStore.setState({
      classes: [
        {
          id: "class-1",
          ...
        }
      ]
    });
  ```
  We will change `"class-1"` to `"class-test-1"` in the mock store setups. This way, the test class is NOT filtered out by the dashboard and will correctly show "Tienes 1 clase próxima hoy" in tests!

---

### Task 3: Verify & Test
**Files:**
- None

- [ ] **Step 1: Run Vitest tests**
  Run: `pnpm --filter @kobi/web test`
  Expected: All 15 tests pass.
