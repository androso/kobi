import type { SupabaseClient } from "@supabase/supabase-js";
import { classifySafeError, safeLog } from "@kobi/ai-core";
import { digestTextbookPdf } from "@kobi/curriculum";
import type PgBoss from "pg-boss";
import { JOB_INGEST_CURRICULUM_SOURCE } from "../queue.js";

export interface IngestCurriculumSourceJobData {
  sourceId: string;
  classId: string;
}

interface CleanupSource {
  id: string;
  origin_class_id: string | null;
  storage_path: string;
  chunks_built: number | null;
}

const DEFAULT_CURRICULUM_BUCKET = "curriculum-sources";
const MAX_PDF_BYTES = 50 * 1024 * 1024;
const MAX_PDF_PAGES = 400;

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
      "id,origin_class_id,source_document,storage_path,status,size_bytes,grade,subject,unit,chunks_built",
    )
    .eq("id", sourceId)
    .eq("origin_class_id", classId)
    .maybeSingle();

  if (sourceError) {
    throw new Error(`ingestCurriculumSource: failed to load source: ${sourceError.message}`);
  }
  if (!source) {
    throw new Error(`ingestCurriculumSource: source ${sourceId} not found for class ${classId}`);
  }

  if (source.status === "cleanup_pending") {
    await finalizeCurriculumSourceCleanup(supabase, source as CleanupSource);
    const chunksBuilt = typeof source.chunks_built === "number" ? source.chunks_built : 0;
    return { inserted: chunksBuilt, chunksBuilt };
  }

  const grade = Number(source.grade);
  const subject = typeof source.subject === "string" ? source.subject.trim() : "";
  const unit = typeof source.unit === "string" ? source.unit.trim() : "";
  if (!Number.isInteger(grade) || grade <= 0 || !subject || !unit) {
    await markFailed(supabase, sourceId, "Source grade/subject/unit is incomplete.");
    throw new Error("ingestCurriculumSource: source context is incomplete");
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
    throw new Error(`ingestCurriculumSource: failed to mark processing: ${processingError.message}`);
  }

  let cleanupPending = false;
  try {
    if (typeof source.size_bytes === "number" && source.size_bytes > MAX_PDF_BYTES) {
      throw new Error(`PDF exceeds max size ${MAX_PDF_BYTES} bytes`);
    }

    const bucket = process.env.CURRICULUM_BUCKET ?? DEFAULT_CURRICULUM_BUCKET;
    const { data: blob, error: downloadError } = await supabase.storage
      .from(bucket)
      .download(source.storage_path);
    if (downloadError || !blob) {
      throw new Error(`Failed to download curriculum PDF: ${downloadError?.message ?? "missing blob"}`);
    }

    const pdfBytes = new Uint8Array(await blob.arrayBuffer());
    if (pdfBytes.byteLength === 0) throw new Error("Downloaded curriculum PDF is empty");
    if (pdfBytes.byteLength > MAX_PDF_BYTES) {
      throw new Error(`PDF exceeds max size ${MAX_PDF_BYTES} bytes`);
    }

    const result = await digestTextbookPdf(supabase, {
      pdfBytes,
      grade,
      subject,
      unit,
      sourceDocument: source.source_document,
      sourceId,
      replaceSource: true,
      maxBytes: MAX_PDF_BYTES,
      maxPages: MAX_PDF_PAGES,
    });

    const { error: pendingError } = await supabase
      .from("curriculum_sources")
      .update({
        status: "cleanup_pending",
        error_message: null,
        page_count: result.pageCount,
        chunks_built: result.chunksBuilt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sourceId);
    if (pendingError) {
      throw new Error(`ingestCurriculumSource: failed to mark cleanup pending: ${pendingError.message}`);
    }
    cleanupPending = true;

    await finalizeCurriculumSourceCleanup(supabase, {
      id: sourceId,
      origin_class_id: classId,
      storage_path: source.storage_path,
      chunks_built: result.chunksBuilt,
    });

    safeLog("info", "curriculum.ingest_ready", {
      sourceId,
      classId,
      chunksBuilt: result.chunksBuilt,
      inserted: result.inserted,
      pageCount: result.pageCount,
    });
    return { inserted: result.inserted, chunksBuilt: result.chunksBuilt };
  } catch (error) {
    safeLog("error", cleanupPending ? "curriculum.cleanup_failed" : "curriculum.ingest_failed", {
      sourceId,
      classId,
      outcome: classifySafeError(error),
    });
    if (!cleanupPending) {
      const message = error instanceof Error ? error.message : "Curriculum ingest failed";
      await markFailed(supabase, sourceId, message.slice(0, 500));
    }
    throw error;
  }
}

export async function reconcileCurriculumSourceCleanup(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase
    .from("curriculum_sources")
    .select("id,origin_class_id,storage_path,chunks_built")
    .eq("status", "cleanup_pending")
    .limit(100);
  if (error) {
    safeLog("error", "curriculum.cleanup_reconcile_load_failed", {
      outcome: classifySafeError(error),
    });
    return;
  }

  for (const source of data ?? []) {
    try {
      await finalizeCurriculumSourceCleanup(supabase, source as CleanupSource);
    } catch (cleanupError) {
      safeLog("error", "curriculum.cleanup_reconcile_failed", {
        sourceId: source.id,
        outcome: classifySafeError(cleanupError),
      });
    }
  }
}

async function finalizeCurriculumSourceCleanup(
  supabase: SupabaseClient,
  source: CleanupSource,
): Promise<void> {
  const bucket = process.env.CURRICULUM_BUCKET ?? DEFAULT_CURRICULUM_BUCKET;
  const { error: removeError } = await supabase.storage.from(bucket).remove([source.storage_path]);
  if (removeError) {
    throw new Error(`ingestCurriculumSource: failed to delete source PDF: ${removeError.message}`);
  }

  const { error: readyError } = await supabase
    .from("curriculum_sources")
    .update({
      status: "ready",
      error_message: null,
      storage_deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", source.id)
    .eq("status", "cleanup_pending");
  if (readyError) {
    throw new Error(`ingestCurriculumSource: failed to mark ready: ${readyError.message}`);
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
    throw new Error(`ingestCurriculumSource: failed to mark failed status: ${error.message}`, {
      cause: new Error(message),
    });
  }
}
