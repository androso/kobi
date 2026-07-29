import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildLessonState,
  lessonStateSchema,
  type LessonState,
  type LessonStateClassContext,
} from "@kobi/ai-core";
import type PgBoss from "pg-boss";
import {
  evaluateContextReadiness,
  readContextReadinessThresholds,
} from "../checkpoint/contextReadiness.js";
import { JOB_EVALUATE_CHECKPOINT } from "../queue.js";
import { silentLessonState } from "../silentLessonState.js";

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
 * Build the rolling lesson_state from bounded batches of 1-2 chunks. A single
 * job drains every currently contiguous batch so chunks whose earlier gap has
 * just closed cannot be left without another job to advance them.
 *
 * This job no longer decides when to move to the Propose stage — that decision
 * lives in the checkpoint gate (checkpointScheduler.job.ts +
 * evaluateCheckpoint.job.ts), which runs on its own timer independent of this
 * per-chunk cadence and reads accumulated segments directly.
 *
 * TODO(Area D/Realtime): push the new lesson_state to the teacher UI via
 * Supabase Realtime once apps/web subscribes to it.
 */
export function registerBuildLessonStateJob(boss: PgBoss, supabase: SupabaseClient) {
  const readinessThresholds = readContextReadinessThresholds();
  const readinessHistoryLimit = Math.max(
    readinessThresholds.minSegments,
    readinessThresholds.minStableSegments,
  );

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
        stage = "loading previous lesson_state";
        const { data: previousSegments, error: previousSegmentError } = await supabase
          .from("segments")
          .select("lesson_state")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: false })
          .limit(readinessHistoryLimit);
        if (previousSegmentError) {
          throw new Error(`buildLessonState job: failed to load previous segment: ${previousSegmentError.message}`);
        }
        const previousSegment = previousSegments?.[0];
        const recentLessonStates = (previousSegments ?? [])
          .map((segment) => lessonStateSchema.safeParse(segment.lesson_state))
          .filter((result) => result.success)
          .map((result) => result.data)
          .reverse();

        stage = "loading class context";
        const classContext = await resolveLessonStateClassContext(supabase, job.data);

        stage = "loading lesson-state progress";
        const { data: progressSegment, error: progressSegmentError } = await supabase
          .from("segments")
          .select("source_through_chunk_index")
          .eq("session_id", sessionId)
          .not("source_through_chunk_index", "is", null)
          .order("source_through_chunk_index", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (progressSegmentError) {
          throw new Error(
            `buildLessonState job: failed to load progress segment: ${progressSegmentError.message}`,
          );
        }

        const previousProgress =
          typeof progressSegment?.source_through_chunk_index === "number"
            ? progressSegment.source_through_chunk_index
            : -1;
        let nextChunkIndex = previousProgress + 1;
        let currentLessonState = (previousSegment?.lesson_state as LessonState) ?? null;
        let contextCheckpointQueued = false;

        while (true) {
          stage = "loading completed chunks";
          const { data: chunks, error: chunksError } = await supabase
            .from("audio_chunks")
            .select("chunk_index, status, transcript_text")
            .eq("session_id", sessionId)
            .in("status", ["transcribed", "failed"])
            .gte("chunk_index", nextChunkIndex)
            .order("chunk_index", { ascending: true })
            .limit(2);

          if (chunksError) {
            throw new Error(`buildLessonState job: failed to load chunks: ${chunksError.message}`);
          }

          const contiguousChunks: Array<{
            chunk_index: number;
            transcript_text: string;
          }> = [];
          let expectedChunkIndex = nextChunkIndex;
          for (const chunk of chunks ?? []) {
            if (
              chunk.chunk_index !== expectedChunkIndex ||
              (chunk.status !== "failed" && typeof chunk.transcript_text !== "string")
            ) {
              break;
            }
            contiguousChunks.push({
              chunk_index: chunk.chunk_index,
              transcript_text:
                chunk.status === "transcribed" && typeof chunk.transcript_text === "string"
                  ? chunk.transcript_text
                  : "",
            });
            expectedChunkIndex += 1;
          }

          if (contiguousChunks.length === 0) {
            const logContext = {
              sessionId,
              jobId: job.id,
              chunkCount: chunks?.length ?? 0,
              nextChunkIndex,
            };
            if ((chunks?.length ?? 0) === 0) {
              console.info("[buildLessonState] caught up with completed transcripts", logContext);
            } else {
              console.warn(
                "[buildLessonState] stopped at a gap before the next completed transcript",
                logContext,
              );
            }
            return;
          }

          const transcriptText = contiguousChunks
            .map((chunk) => chunk.transcript_text.trim())
            .filter(Boolean)
            .join("\n");
          const sourceThroughChunkIndex = contiguousChunks.at(-1)!.chunk_index;
          let lessonState = currentLessonState;

          if (transcriptText) {
            stage = "calling lesson-state model";
            console.info("[buildLessonState] requesting structured lesson_state", {
              sessionId,
              jobId: job.id,
              transcriptChars: transcriptText.length,
              hasPreviousLessonState: Boolean(currentLessonState),
              provider: "openai",
              model: process.env.LESSON_STATE_MODEL ?? "gpt-4o-mini",
            });
            lessonState = await buildLessonState({
              transcriptText,
              classContext,
              previousLessonState: currentLessonState,
            });
          } else {
            lessonState ??= silentLessonState;
            console.info("[buildLessonState] advancing progress across silent chunks", {
              sessionId,
              jobId: job.id,
              sourceThroughChunkIndex,
            });
          }

          stage = "inserting lesson_state segment";
          const { data: segment, error: segmentError } = await supabase
            .from("segments")
            .insert({
              session_id: sessionId,
              lesson_state: lessonState,
              confidence: lessonState.confidence,
              transcript_summary: lessonState.transcript_summary,
              source_through_chunk_index: sourceThroughChunkIndex,
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
            topic: lessonState.topic,
            confidence: lessonState.confidence,
            sourceThroughChunkIndex,
            durationMs: Date.now() - startedAt,
          });

          if (transcriptText) {
            recentLessonStates.push(lessonState);
            if (recentLessonStates.length > readinessHistoryLimit) {
              recentLessonStates.splice(0, recentLessonStates.length - readinessHistoryLimit);
            }
            const readiness = evaluateContextReadiness(recentLessonStates, readinessThresholds);
            if (readiness.eligible && !contextCheckpointQueued) {
              const checkpointJobId = await boss.send(
                JOB_EVALUATE_CHECKPOINT,
                {
                  sessionId,
                  grade: job.data.grade,
                  subject: job.data.subject,
                  unit: job.data.unit,
                  trigger: "context",
                },
                {
                  singletonKey: sessionId,
                  singletonSeconds: 60,
                  retryLimit: 3,
                  retryDelay: 10,
                  retryBackoff: true,
                },
              );
              contextCheckpointQueued = true;
              console.info("[buildLessonState] context checkpoint enqueued", {
                sessionId,
                lessonStateJobId: job.id,
                checkpointJobId,
                ...readiness,
              });
            }
          }

          currentLessonState = lessonState;
          nextChunkIndex = sourceThroughChunkIndex + 1;
        }
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
