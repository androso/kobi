import type { SupabaseClient } from "@supabase/supabase-js";
import { classifySafeError, safeLog } from "@kobi/ai-core";
import { digestTextbookPdf } from "@kobi/curriculum";
import type PgBoss from "pg-boss";
import { JOB_INGEST_CURRICULUM_SOURCE } from "../queue.js";

export interface IngestCurriculumSourceJobData {
  sourceId: string;
  classId: string;
}

const DEFAULT_CURRICULUM_BUCKET = "curriculum-sources";
const MAX_PDF_BYTES = 25 * 1024 * 1024;

export function registerIngestCurriculumSourceJob(boss: PgBoss, supabase: SupabaseClient) {
  return boss.work<IngestCurriculumSourceJobData>(
    JOB_INGEST_CURRICULUM_SOURCE,
    { batchSize: 1 },
    async (jobs) => {
      const job = jobs[0];
      if (!job) return;
      await runIngestCurriculumSourceJob(supabase, job.data);
    },
  );
}

export async function runIngestCurriculumSourceJob(
  supabase: SupabaseClient,
  data: IngestCurriculumSourceJobData,
): Promise<{ inserted: number; chunksBuilt: number }> {
  const { sourceId, classId } = data;
  safeLog("info", "curriculum.ingest_picked_up", { sourceId, classId });

  const { data: source, error: sourceError } = await supabase
    .from("curriculum_sources")
    .select(
      "id,class_id,source_document,storage_path,status,size_bytes,classes(grade,subject,unit)",
    )
    .eq("id", sourceId)
    .eq("class_id", classId)
    .maybeSingle();

  if (sourceError) {
    throw new Error(`ingestCurriculumSource: failed to load source: ${sourceError.message}`);
  }
  if (!source) {
    throw new Error(`ingestCurriculumSource: source ${sourceId} not found for class ${classId}`);
  }

  const classContext = normalizeClassContext(source.classes);
  if (!classContext) {
    await markFailed(supabase, sourceId, "Class grade/subject/unit is incomplete.");
    throw new Error("ingestCurriculumSource: class context is incomplete");
  }

  const { error: processingError } = await supabase
    .from("curriculum_sources")
    .update({
      status: "processing",
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sourceId);

  if (processingError) {
    throw new Error(
      `ingestCurriculumSource: failed to mark processing: ${processingError.message}`,
    );
  }

  try {
    if (typeof source.size_bytes === "number" && source.size_bytes > MAX_PDF_BYTES) {
      throw new Error(`PDF exceeds max size ${MAX_PDF_BYTES} bytes`);
    }

    const bucket = process.env.CURRICULUM_BUCKET ?? DEFAULT_CURRICULUM_BUCKET;
    const { data: blob, error: downloadError } = await supabase.storage
      .from(bucket)
      .download(source.storage_path);

    if (downloadError || !blob) {
      throw new Error(
        `Failed to download curriculum PDF: ${downloadError?.message ?? "missing blob"}`,
      );
    }

    const pdfBytes = new Uint8Array(await blob.arrayBuffer());
    if (pdfBytes.byteLength === 0) {
      throw new Error("Downloaded curriculum PDF is empty");
    }
    if (pdfBytes.byteLength > MAX_PDF_BYTES) {
      throw new Error(`PDF exceeds max size ${MAX_PDF_BYTES} bytes`);
    }

    const result = await digestTextbookPdf(supabase, {
      pdfBytes,
      grade: classContext.grade,
      subject: classContext.subject,
      unit: classContext.unit,
      sourceDocument: source.source_document,
      classId,
      replaceSource: true,
      maxBytes: MAX_PDF_BYTES,
    });

    const { error: readyError } = await supabase
      .from("curriculum_sources")
      .update({
        status: "ready",
        error_message: null,
        page_count: result.pageCount,
        chunks_built: result.chunksBuilt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sourceId);

    if (readyError) {
      throw new Error(`ingestCurriculumSource: failed to mark ready: ${readyError.message}`);
    }

    await markOtherClassSourcesSuperseded(supabase, classId, sourceId);

    safeLog("info", "curriculum.ingest_ready", {
      sourceId,
      classId,
      chunksBuilt: result.chunksBuilt,
      inserted: result.inserted,
      pageCount: result.pageCount,
    });

    return { inserted: result.inserted, chunksBuilt: result.chunksBuilt };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Curriculum ingest failed";
    safeLog("error", "curriculum.ingest_failed", {
      sourceId,
      classId,
      outcome: classifySafeError(error),
    });
    await markFailed(supabase, sourceId, message.slice(0, 500));
    throw error;
  }
}

async function markFailed(supabase: SupabaseClient, sourceId: string, message: string) {
  const { error } = await supabase
    .from("curriculum_sources")
    .update({
      status: "failed",
      error_message: message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sourceId);
  if (error) {
    throw new Error(
      `ingestCurriculumSource: failed to mark failed status: ${error.message}`,
      { cause: new Error(message) },
    );
  }
}

async function markOtherClassSourcesSuperseded(
  supabase: SupabaseClient,
  classId: string,
  sourceId: string,
) {
  const { error } = await supabase
    .from("curriculum_sources")
    .update({
      status: "superseded",
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("class_id", classId)
    .neq("id", sourceId)
    .neq("status", "failed")
    .neq("status", "superseded");

  if (error) {
    safeLog("error", "curriculum.supersede_old_sources_failed", {
      classId,
      sourceId,
      outcome: classifySafeError(error),
    });
  }
}

function normalizeClassContext(
  value: unknown,
): { grade: number; subject: string; unit: string } | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || typeof raw !== "object") return null;

  const row = raw as Record<string, unknown>;
  const grade = Number(row.grade);
  const subject = typeof row.subject === "string" ? row.subject.trim() : "";
  const unit = typeof row.unit === "string" ? row.unit.trim() : "";

  if (!Number.isInteger(grade) || grade <= 0 || !subject || !unit) return null;
  return { grade, subject, unit };
}
