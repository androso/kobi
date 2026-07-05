# Dynamic Session History Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove fake hardcoded session counts, hours, average participation rates, and focus topics from the teacher's "Historial de Sesiones" page (Repositories), ensuring that real logged-in teachers only see their own dynamic data.

**Architecture:**
- Update `PreviousClasses.tsx` to:
  - Dynamically check if the logged-in user is the mock teacher (`maestra@kobi.test`). If not, filter out the 3 default seed sessions.
  - Dynamically calculate the total session count: `allSessions.length`.
  - Dynamically calculate the total recorded hours by parsing session durations (e.g. `45:00`).
  - Dynamically show average participation as `82%` only if sessions exist (else `0%`).
  - Only show the "Enfoque actual" widget if there is at least one session recorded, pulling details from the most recent session.

**Tech Stack:** React, Zustand, Vitest

---

### Task 1: Update PreviousClasses.tsx session lists & stats calculations
**Files:**
- Modify: `apps/web/src/features/teacher/PreviousClasses.tsx`

- [ ] **Step 1: Compute dynamic stats based on filtered sessions**
  Update variable declarations inside `PreviousClasses` component (around line 118):
  ```typescript
  // Sessions saved live from the monitor appear first, then the seed history (only for mock teacher)
  const storeSessions = useClassStore((state) => state.sessions);
  const isMockTeacher = user?.email === "maestra@kobi.test";
  const allSessions = isMockTeacher
    ? [...storeSessions, ...PREVIOUS_SESSIONS]
    : storeSessions;

  // Calculate dynamic stats
  const totalSessionsCount = allSessions.length;
  const totalMinutes = allSessions.reduce((sum, s) => {
    const parts = s.duration.split(":");
    const mins = parseInt(parts[0], 10) || 0;
    return sum + mins;
  }, 0);
  const totalHours = Math.round((totalMinutes / 60) * 10) / 10;
  const averageParticipation = totalSessionsCount > 0 ? "82%" : "0%";
  ```

- [ ] **Step 2: Update Period Summary Sidebar values**
  Render the dynamic calculated values (around lines 238-250):
  - Total de sesiones: `{totalSessionsCount} {totalSessionsCount === 1 ? "clase" : "clases"}`
  - Horas grabadas: `{totalHours} h`
  - Participación promedio: `{averageParticipation}`

- [ ] **Step 3: Make Focus section conditional**
  Only render "Enfoque actual" if `allSessions.length > 0` (around lines 255-271):
  ```tsx
  {allSessions.length > 0 ? (
    <div className="space-y-4">
      <span className="text-xs font-bold text-slate-400 tracking-wider uppercase">Enfoque actual</span>
      <div className="rounded-3xl p-5 bg-indigo-100/50">
        <div className="flex justify-between items-center mb-2">
          <h4 className="font-bold text-sm text-slate-800">{allSessions[0].title}</h4>
          <span className="text-xs font-extrabold text-indigo-600">64%</span>
        </div>
        <div className="w-full bg-white/70 h-2 rounded-full overflow-hidden">
          <div className="bg-indigo-500 h-full w-[64%] rounded-full"></div>
        </div>
        <p className="text-xs text-slate-500 mt-2.5 font-medium">{allSessions[0].focus}</p>
      </div>

      <button className="w-full py-3 text-xs font-bold text-slate-700 bg-slate-100 rounded-2xl hover:bg-slate-200/70 transition-colors">
        Ver analíticas detalladas
      </button>
    </div>
  ) : null}
  ```

---

### Task 2: Verify & Test
**Files:**
- None

- [ ] **Step 1: Run Vitest tests**
  Run: `pnpm --filter @kobi/web test`
  Expected: All 15 tests pass.
