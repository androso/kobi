# Fetch Session Transcript Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded/empty transcripts for real teacher sessions with the actual transcribed audio chunks fetched dynamically from Supabase.

**Architecture:**
- Update `LiveClassMonitor.tsx` to:
  - Override `session.id` with the real backend UUID (`apiSessionIdRef.current`) when recording completes, ensuring it is saved using the correct primary key.
- Update `PreviousClasses.tsx` to:
  - Import `supabase` client.
  - Add helper function `formatTimeMs` to convert milliseconds to `MM:SS` format.
  - Update `handleOpenDetailsModal` to fetch all transcribed chunks for that session from the `audio_chunks` table, mapped to transcript lines, updating the state accordingly.

**Tech Stack:** React, Zustand, Supabase, Vitest

---

### Task 1: Attach backend session ID in LiveClassMonitor.tsx
**Files:**
- Modify: `apps/web/src/features/teacher/LiveClassMonitor.tsx`

- [ ] **Step 1: Set session ID inside stopRecording**
  Assign `apiSessionIdRef.current` to `session.id` if it is populated:
  ```typescript
  if (monitoringClass) {
    const teacherId = useAuthStore.getState().user?.id;
    const session = buildSession(monitoringClass, elapsed, teacherId);
    if (apiSessionIdRef.current) {
      session.id = apiSessionIdRef.current;
    }
    endSession(session);
    setFinishedSession(session);
  }
  ```

---

### Task 2: Fetch and format transcript in PreviousClasses.tsx
**Files:**
- Modify: `apps/web/src/features/teacher/PreviousClasses.tsx`

- [ ] **Step 1: Import supabase client**
  Import `supabase` at the top of the file:
  ```typescript
  import { supabase } from "../../lib/supabase";
  ```

- [ ] **Step 2: Add formatTimeMs helper**
  Define `formatTimeMs` above the `PreviousClasses` component:
  ```typescript
  function formatTimeMs(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  ```

- [ ] **Step 3: Update handleOpenDetailsModal to fetch chunks**
  Check if the session is not mock, fetch its chunks from Supabase, sort by chunk index, map to dialogue lines, and set state:
  ```typescript
  async function handleOpenDetailsModal(session: SavedSession) {
    const isMock = session.id.startsWith("seed-");
    if (!isMock && supabase) {
      try {
        const { data: chunks, error } = await supabase
          .from("audio_chunks")
          .select("transcript_text, start_ms, chunk_index")
          .eq("session_id", session.id)
          .order("chunk_index", { ascending: true });

        if (!error && chunks) {
          const lines = chunks
            .filter((c) => c.transcript_text && c.transcript_text.trim().length > 0)
            .map((c) => ({
              time: formatTimeMs(c.start_ms),
              speaker: "Docente",
              text: c.transcript_text,
            }));

          setSelectedSession({
            ...session,
            transcript: lines,
          });
          return;
        }
      } catch (err) {
        console.error("Error loading transcript from Supabase:", err);
      }
    }

    setSelectedSession(session);
  }
  ```

---

### Task 3: Verify & Test
**Files:**
- None

- [ ] **Step 1: Run Vitest tests**
  Run: `pnpm --filter @kobi/web test`
  Expected: All 15 tests pass.
