import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadSelectedCurriculumSourceIds(
  supabase: SupabaseClient,
  classId: string | undefined,
): Promise<string[]> {
  if (!classId) return [];

  const { data, error } = await supabase
    .from("curriculum_source_selections")
    .select("source_id")
    .eq("class_id", classId)
    .limit(50);

  if (error) {
    throw new Error(`failed to load curriculum selections: ${error.message}`);
  }

  return (data ?? [])
    .map((row) => (typeof row.source_id === "string" ? row.source_id : null))
    .filter((sourceId): sourceId is string => Boolean(sourceId));
}
