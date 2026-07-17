import type { SupabaseClient } from "@supabase/supabase-js";
import { buildLessonState, type LessonState, type LessonStateClassContext } from "@kobi/ai-core";
import type PgBoss from "pg-boss";

export interface BuildLessonStateJobData {
  sessionId: string;
  grade?: number;
  subject?: string;
  unit?: string;
}

export async function resolveLessonStateClassContext(
  supabase: SupabaseClient,
  data: BuildLessonStateJobData,
): Promise<LessonStateClassContext> {
  const explicitGrade = data.grade;
  const explicitSubject = data.subject?.trim();
  if (explicitGrade != null && (!Number.isInteger(explicitGrade) || explicitGrade <= 0)) {
    throw new Error("buildLessonState job: grade must be a positive integer");
  }
  if (data.subject != null && !explicitSubject) {
    throw new Error("buildLessonState job: subject must not be empty");
  }
  if (explicitGrade != null && explicitSubject) return { grade: explicitGrade, subject: explicitSubject };

  const { data: session, error } = await supabase
    .from("sessions")
    .select("classes(grade,subject)")
    .eq("id", data.sessionId)
    .maybeSingle();
  if (error) throw new Error(`buildLessonState job: failed to load class context: ${error.message}`);

  const rawClass = Array.isArray(session?.classes) ? session.classes[0] : session?.classes;
  if (!rawClass || typeof rawClass !== "object") {
    throw new Error("buildLessonState job: session has no class context");
  }
  const classContext = rawClass as Record<string, unknown>;
  const classGrade = Number(classContext.grade);
  const classSubject = typeof classContext.subject === "string" ? classContext.subject.trim() : "";
  const grade = explicitGrade ?? classGrade;
  const subject = explicitSubject ?? classSubject;
  if (!Number.isInteger(grade) || grade <= 0 || !subject) {
    throw new Error("buildLessonState job: class grade and subject are required");
  }
  return { grade, subject };
}

/**
 * On 1-2 newly transcribed chunks: build the rolling lesson_state and persist
 * it as a segments row. This job no longer decides when to move to the
 * Propose stage — that decision now lives in the checkpoint gate.
 */
export function registerBuildLessonStateJob(boss: PgBoss, supabase: SupabaseClient) {
  return boss.work<BuildLessonStateJobData>(
    "build-lesson-state",
    { batchSize: 1 },
    async (jobs) => {
      const job = jobs[0];
      if (!job) return;

      const { sessionId } = job.data;
      const startedAt = Date.now();
      let stage = "loading transcribed chunks";
      console.info("[buildLessonState] job started", { sessionId, jobId: job.id });

      try {
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
        if (!transcriptText) {
          console.warn("[buildLessonState] skipped because recent chunks have no transcript", {
            sessionId,
            jobId: job.id,
            chunkCount: chunks?.length ?? 0,
          });
          return;
        }

        stage = "loading previous lesson_state";
        const { data: previousSegment, error: previousSegmentError } = await supabase
          .from("segments")
          .select("lesson_state")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (previousSegmentError) {
          throw new Error(`buildLessonState job: failed to load previous segment: ${previousSegmentError.message}`);
        }

        stage = "loading class context";
        const classContext = await resolveLessonStateClassContext(supabase, job.data);

        stage = "calling lesson-state model";
        console.info("[buildLessonState] requesting structured lesson_state", {
          sessionId,
          jobId: job.id,
          transcriptChars: transcriptText.length,
          hasPreviousLessonState: Boolean(previousSegment?.lesson_state),
          provider: "openai",
          model: process.env.LESSON_STATE_MODEL ?? "gpt-4o-mini",
        });
        const lessonState: LessonState = await buildLessonState({
          transcriptText,
          classContext,
          previousLessonState: (previousSegment?.lesson_state as LessonState) ?? null,
        });

        stage = "inserting lesson_state segment";
        const { data: segment, error: segmentError } = await supabase
          .from("segments")
          .insert({
            session_id: sessionId,
            lesson_state: lessonState,
            confidence: lessonState.confidence,
            transcript_summary: lessonState.transcript_summary,
          })
          .select("id")
          .single();
        if (segmentError) {
          throw new Error(`buildLessonState job: failed to insert segment: ${segmentError.message}`);
        }
        console.info("[buildLessonState] lesson_state persisted", {
          sessionId,
          jobId: job.id,
          segmentId: segment.id,
          confidence: lessonState.confidence,
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        console.error("[buildLessonState] job failed", {
          sessionId,
          jobId: job.id,
          stage,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.stack ?? error.message : error,
        });
        throw error;
      }
    },
  );
}