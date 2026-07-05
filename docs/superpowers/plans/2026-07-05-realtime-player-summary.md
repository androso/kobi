# Realtime Player & Dynamic AI Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 
1. Make the play progress timer, the audio duration, and elapsed time next to the "Docente" label update in real-time when the teacher plays the session audio.
2. Fetch the dynamic AI summary points and next steps from the `segments` table in Supabase for real recorded sessions instead of showing hardcoded science lesson data.

**Architecture:**
- Update `PreviousClasses.tsx` to:
  - Add `getPlayTime` helper function to compute `"MM:SS"` formatted time from progress percentage.
  - Implement a `useEffect` timer that automatically increments `playProgress` based on the session's actual duration and `playbackRate` when `isPlaying` is active.
  - Render the current play time next to the teacher's name in both headers.
  - Fetch the latest row from `segments` table where `session_id = session.id` inside `handleOpenDetailsModal`. If present, parse its `lesson_state` and set dynamic `summaryPoints` and `nextSteps` in the selected session state.

**Tech Stack:** React, Supabase, Vitest

---

### Task 1: Add time formatting helper and playback timer in PreviousClasses.tsx
**Files:**
- Modify: `apps/web/src/features/teacher/PreviousClasses.tsx`

- [ ] **Step 1: Define getPlayTime helper**
  Define `getPlayTime` under `formatTimeMs` (around line 113):
  ```typescript
  function getPlayTime(progressPercent: number, durationStr: string): string {
    const parts = durationStr.split(":");
    const mins = parseInt(parts[0], 10) || 0;
    const secs = parseInt(parts[1], 10) || 0;
    const totalSeconds = mins * 60 + secs;
    
    const currentSeconds = Math.min(totalSeconds, Math.round((progressPercent / 100) * totalSeconds));
    const currentMins = Math.floor(currentSeconds / 60);
    const currentSecs = currentSeconds % 60;
    return `${String(currentMins).padStart(2, "0")}:${String(currentSecs).padStart(2, "0")}`;
  }
  ```

- [ ] **Step 2: Add playback progress effect**
  Implement the progress interval inside the `PreviousClasses` component (around line 140):
  ```typescript
  useEffect(() => {
    if (!isPlaying || !selectedSession) return;

    const parts = selectedSession.duration.split(":");
    const mins = parseInt(parts[0], 10) || 0;
    const secs = parseInt(parts[1], 10) || 0;
    const totalSeconds = mins * 60 + secs;
    if (totalSeconds <= 0) return;

    const interval = setInterval(() => {
      setPlayProgress((prev) => {
        const step = (1 / totalSeconds) * 100;
        const next = prev + step;
        if (next >= 100) {
          setIsPlaying(false);
          return 100;
        }
        return next;
      });
    }, 1000 / playbackRate);
    return () => clearInterval(interval);
  }, [isPlaying, playbackRate, selectedSession]);
  ```

---

### Task 2: Fetch dynamic AI summary from segments in PreviousClasses.tsx
**Files:**
- Modify: `apps/web/src/features/teacher/PreviousClasses.tsx`

- [ ] **Step 1: Query segments in handleOpenDetailsModal**
  Update the fetch block in `handleOpenDetailsModal` to load segments:
  ```typescript
  // Load AI summary segment
  const { data: segmentRow } = await supabase
    .from("segments")
    .select("lesson_state")
    .eq("session_id", session.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let summaryPoints = session.summaryPoints;
  let nextSteps = session.nextSteps;

  if (segmentRow && segmentRow.lesson_state) {
    const lessonState = segmentRow.lesson_state as any;
    const dynamicSummary = [
      lessonState.topic ? `Tema detectado: ${lessonState.topic}.` : null,
      lessonState.objective_guess ? `Objetivo estimado: ${lessonState.objective_guess}.` : null,
      lessonState.key_terms && lessonState.key_terms.length > 0 ? `Términos clave abordados: ${lessonState.key_terms.join(", ")}.` : null,
      lessonState.transcript_summary ? `Resumen de la lección: ${lessonState.transcript_summary}.` : null,
    ].filter(Boolean) as string[];

    const dynamicSteps = lessonState.evidence && lessonState.evidence.reason
      ? [`Análisis de la lección: ${lessonState.evidence.reason}.`, `Revisar y asignar actividades complementarias.` ]
      : [`Revisar y asignar actividades complementarias.`];

    if (dynamicSummary.length > 0) summaryPoints = dynamicSummary;
    if (dynamicSteps.length > 0) nextSteps = dynamicSteps;
  }
  ```
  Pass the computed summary points and next steps to the state setter.

---

### Task 3: Render dynamic times in modal views
**Files:**
- Modify: `apps/web/src/features/teacher/PreviousClasses.tsx`

- [ ] **Step 1: Update bubble header play progress**
  Lines 391-393:
  ```tsx
  <p className="text-xs text-slate-500 mt-0.5 font-medium">
    {teacherName} · {getPlayTime(playProgress, selectedSession.duration)} / {selectedSession.duration}
  </p>
  ```

- [ ] **Step 2: Update dialogue header card**
  Lines 470-472:
  ```tsx
  <p className="text-xs text-slate-400 font-medium mt-0.5">
    {teacherName} · {getPlayTime(playProgress, selectedSession.duration)} / {selectedSession.duration}
  </p>
  ```

---

### Task 4: Verify & Test
**Files:**
- None

- [ ] **Step 1: Run Vitest tests**
  Run: `pnpm --filter @kobi/web test`
  Expected: All 15 tests pass.
