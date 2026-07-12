import type { SupabaseClient } from "@supabase/supabase-js";

export interface SessionReport {
  id: string; class_id: string; class_name: string; subject: string; unit: string;
  status: "active" | "completed"; started_at: string; ended_at: string | null;
  duration_seconds: number; topics: string[]; objective: string | null;
  assignment_count: number; completed_count: number; completion_rate: number;
  average_score: number; score_distribution: { low: number; middle: number; high: number };
  hints: number; difficult_items: Array<{ item_index: number; incorrect_attempts: number }>;
  band_outcomes: Record<string, { assigned: number; completed: number; average_score: number }>;
  total_count: number;
}

export const REPORT_PAGE_SIZE = 20;

export async function loadSessionReports(client: SupabaseClient, page: number, classId?: string) {
  const to = new Date();
  const from = new Date(to); from.setDate(from.getDate() - 90);
  const { data, error } = await client.rpc("list_teacher_session_reports", {
    input_class_id: classId ?? null, input_from: from.toISOString(), input_to: to.toISOString(),
    input_limit: REPORT_PAGE_SIZE, input_offset: page * REPORT_PAGE_SIZE,
  });
  if (error) throw error;
  return (data ?? []).map((row: { report: SessionReport } | SessionReport) => "report" in row ? row.report : row);
}
