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
