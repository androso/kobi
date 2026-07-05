export type SessionStatus = "active" | "ended";

export interface Session {
  id: string;
  class_id: string;
  status: SessionStatus;
  started_at: string;
}

export type AudioChunkStatus = "pending" | "transcribing" | "transcribed" | "failed";

export interface AudioChunk {
  id: string;
  session_id: string;
  chunk_index: number;
  storage_path: string;
  start_ms: number;
  end_ms: number;
  status: AudioChunkStatus;
  transcript_text: string | null;
  created_at: string;
}

export interface Segment {
  id: string;
  session_id: string;
  lesson_state: unknown;
  confidence: number;
  transcript_summary: string;
  created_at: string;
}

export interface CurriculumChunkRow {
  id: string;
  grade: number;
  subject: string;
  unit: string;
  objective_code: string;
  text: string;
  embedding: number[] | null;
  created_at: string;
}

export type DifficultyBand = "support" | "core" | "challenge";

export type ActivityStatus = "candidate" | "verified" | "rejected" | "superseded";
export type ActivitySource = "seeded" | "reused" | "forked" | "generated";

export interface ActivityBundleRow {
  ref: string;
  index_html: string;
  checksum: string;
  created_at: string;
}

export interface ActivityRow {
  id: string;
  contract_version: "activity-artifact/v1";
  manifest: unknown;
  bundle_ref: string;
  evidence: unknown;
  parent_id: string | null;
  status: ActivityStatus;
  embedding: number[] | null;
  curriculum_tags: string[];
  source: ActivitySource;
  verifier_scores: unknown;
  times_used: number;
  avg_score: number | null;
  created_at: string;
  updated_at: string;
}

export type SessionActivityCandidateStatus = "ready" | "approved" | "rejected" | "superseded";

export interface SessionActivityCandidateRow {
  id: string;
  session_id: string;
  activity_id: string;
  difficulty_band: DifficultyBand;
  status: SessionActivityCandidateStatus;
  source: Exclude<ActivitySource, "seeded">;
  context_snapshot: unknown;
  evidence: unknown;
  verifier_scores: unknown;
  created_at: string;
  approved_at: string | null;
}

export interface StudentProfileRow {
  id: string;
  class_id: string;
  display_name: string;
  band: DifficultyBand;
  modality_pref: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type AssignmentStatus = "assigned" | "in_progress" | "completed";

export interface AssignmentRow {
  id: string;
  session_id: string;
  student_id: string;
  activity_id: string;
  variant: DifficultyBand;
  status: AssignmentStatus;
  score: number | null;
  created_at: string;
  completed_at: string | null;
}

export type TelemetryEventType = "attempt" | "hint" | "complete";

export interface EventRow {
  id: string;
  assignment_id: string | null;
  student_id: string | null;
  session_id: string | null;
  type: TelemetryEventType;
  payload: unknown;
  ts: string;
}
