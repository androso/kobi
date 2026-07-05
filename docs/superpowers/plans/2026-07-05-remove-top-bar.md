# Remove Top Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the mock top bar `<Header />` component completely from all teacher views to clean up the interface and maximize vertical workspace.

**Architecture:**
- Remove the `<Header />` reference and its import from:
  1. `TeacherDashboard.tsx`
  2. `LiveClassMonitor.tsx`
  3. `PreviousClasses.tsx`
  4. `SessionAnalytics.tsx`
  5. `HelpCenter.tsx`
- Delete `Header.tsx` as it is no longer used anywhere.

**Tech Stack:** React, Vitest

---

### Task 1: Remove Header from teacher views
**Files:**
- Modify: `apps/web/src/features/teacher/TeacherDashboard.tsx`
- Modify: `apps/web/src/features/teacher/LiveClassMonitor.tsx`
- Modify: `apps/web/src/features/teacher/PreviousClasses.tsx`
- Modify: `apps/web/src/features/teacher/SessionAnalytics.tsx`
- Modify: `apps/web/src/features/teacher/HelpCenter.tsx`

- [ ] **Step 1: Modify TeacherDashboard.tsx**
  Remove `<Header />` import and tag from the rendering tree.

- [ ] **Step 2: Modify LiveClassMonitor.tsx**
  Remove `<Header />` import and tag.

- [ ] **Step 3: Modify PreviousClasses.tsx**
  Remove `<Header />` import and tag.

- [ ] **Step 4: Modify SessionAnalytics.tsx**
  Remove `<Header />` import and tag.

- [ ] **Step 5: Modify HelpCenter.tsx**
  Remove `<Header />` import and tag.

---

### Task 2: Clean up unused files
**Files:**
- Delete: `apps/web/src/features/teacher/components/Header.tsx`

- [ ] **Step 1: Delete Header.tsx file**
  Remove the unused component file.

---

### Task 3: Verify & Test
**Files:**
- None

- [ ] **Step 1: Run Vitest tests**
  Run: `pnpm --filter @kobi/web test`
  Expected: All 15 tests pass.
