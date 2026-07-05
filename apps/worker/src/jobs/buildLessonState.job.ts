import type { SupabaseClient } from "@supabase/supabase-js";
import { buildLessonState, type LessonState } from "@kobi/ai-core";
import { retrieveCurriculumMatches } from "@kobi/curriculum";
import type PgBoss from "pg-boss";
import { JOB_GENERATE_ACTIVITY_ARTIFACTS } from "../queue.js";

export interface BuildLessonStateJobData {
  sessionId: string;
  /** TODO(Area D): pull these from the session's class record once that table exists. */
  grade?: number;
  subject?: string;
  unit?: string;
}

/**
 * On 1-2 newly transcribed chunks: build the rolling lesson_state, persist it
 * as a segments row, then kick off Area B retrieval so candidate curriculum
 * evidence is ready before the teacher taps "Hora de actividad".
 *
 * TODO(Area D/Realtime): push the new lesson_state + curriculum matches to
 * the teacher UI via Supabase Realtime once apps/web subscribes to it.
 */
export function registerBuildLessonStateJob(boss: PgBoss, supabase: SupabaseClient) {
  return boss.work<BuildLessonStateJobData>(
    "build-lesson-state",
    { batchSize: 1 },
    async (jobs) => {
      const job = jobs[0];
      if (!job) return;

      const { sessionId, grade = 7, subject = "lenguaje", unit } = job.data;

      const { data: chunks, error: chunksError } = await supabase
        .from("audio_chunks")
        .select("transcript_text")
        .eq("session_id", sessionId)
        .eq("status", "transcribed")
        .order("chunk_index", { ascending: false })
        .limit(2);

      if (chunksError) {
        throw new Error(`buildLessonState job: failed to load chunks: ${chunksError.message}`);
      }

      const transcriptText = (chunks ?? [])
        .map((chunk) => chunk.transcript_text)
        .filter(Boolean)
        .reverse()
        .join("\n");

      if (!transcriptText) return;

      const { data: previousSegment } = await supabase
        .from("segments")
        .select("lesson_state")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const lessonState: LessonState = await buildLessonState({
        transcriptText,
        previousLessonState: (previousSegment?.lesson_state as LessonState) ?? null,
      });

      await supabase.from("segments").insert({
        session_id: sessionId,
        lesson_state: lessonState,
        confidence: lessonState.confidence,
        transcript_summary: lessonState.transcript_summary,
      });

      // Skip retrieval on low-confidence lesson_state (avoid feeding Area C noisy evidence).
      if (lessonState.confidence < 0.5) return;

      const queryText = [lessonState.topic, lessonState.objective_guess, ...lessonState.key_terms]
        .filter(Boolean)
        .join(" ");

      const curriculumMatches = await retrieveCurriculumMatches(supabase, {
        queryText,
        grade,
        subject,
        unit,
      });
      await boss.send(JOB_GENERATE_ACTIVITY_ARTIFACTS, {
        sessionId,
        lessonState,
        curriculumMatches,
      });
    },
  );
}
