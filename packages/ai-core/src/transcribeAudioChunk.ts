import { URL } from "node:url";
import { classifySafeError, safeLog } from "./safeLogging.js";

const DEFAULT_OPENAI_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
const TRANSCRIPTION_PROMPT =
  "Transcribe this classroom audio segment verbatim, in Spanish. Return only the transcript text, no commentary.";

export interface TranscribeAudioChunkInput {
  /** Publicly-fetchable or signed Supabase Storage URL for the audio chunk. */
  audioUrl: string;
  mimeType: string;
  model?: string;
}

export interface TranscribeAudioChunkResult {
  transcriptText: string;
}

/**
 * Area A, stage 1: turn one 45-60s audio chunk into plain text. The worker
 * keeps calling this OpenAI-backed function for each uploaded chunk.
 */
export async function transcribeAudioChunk(
  input: TranscribeAudioChunkInput,
): Promise<TranscribeAudioChunkResult> {
  const audioUrl = parseAudioUrl(input.audioUrl);
  const mimeType = normalizeMimeType(input.mimeType);
  const provider = "openai";
  const model = input.model ?? process.env.TRANSCRIPTION_MODEL ?? DEFAULT_OPENAI_TRANSCRIPTION_MODEL;

  const startedAt = Date.now();
  safeLog("info", "transcription.started", { provider, model, mimeType });

  let rawTranscript: string;
  try {
    rawTranscript = await transcribeWithOpenAI({ audioUrl, mimeType, model });
  } catch (error) {
    safeLog("error", "transcription.failed", {
      provider,
      latencyMs: Date.now() - startedAt,
      outcome: classifySafeError(error),
    });
    throw error;
  }

  const transcriptText = normalizeTranscriptText(rawTranscript);

  if (!transcriptText) {
    safeLog("warn", "transcription.empty", { provider, latencyMs: Date.now() - startedAt });
  } else {
    safeLog("info", "transcription.completed", {
      provider,
      latencyMs: Date.now() - startedAt,
      transcriptBytes: Buffer.byteLength(transcriptText, "utf8"),
    });
  }

  return { transcriptText };
}

interface TranscriptionAdapterInput {
  audioUrl: URL;
  mimeType: string;
  model?: string;
}

async function transcribeWithOpenAI(input: TranscriptionAdapterInput): Promise<string> {
  const apiKey = readOpenAIApiKey();
  const audioBlob = await fetchAudioBlob(input.audioUrl, input.mimeType);
  const form = new FormData();

  form.append("file", audioBlob, audioFilename(input.mimeType));
  form.append("model", input.model ?? process.env.TRANSCRIPTION_MODEL ?? DEFAULT_OPENAI_TRANSCRIPTION_MODEL);
  form.append("language", "es");
  form.append("prompt", TRANSCRIPTION_PROMPT);

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  const body = await readJsonResponse(response, "OpenAI transcription");
  if (!isRecord(body) || typeof body.text !== "string") {
    throw new Error("transcribeAudioChunk: OpenAI response did not include text");
  }

  return body.text;
}

function parseAudioUrl(value: string): URL {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("unsupported protocol");
    }

    return url;
  } catch {
    throw new Error("transcribeAudioChunk: audioUrl must be a valid http(s) URL");
  }
}

function normalizeMimeType(value: string): string {
  const mimeType = value.trim().toLowerCase();
  if (!mimeType.startsWith("audio/") && !mimeType.startsWith("video/")) {
    throw new Error("transcribeAudioChunk: mimeType must be an audio/* or video/* type");
  }

  return mimeType;
}

function readOpenAIApiKey(): string {
  const value = process.env.OPENAI_API_KEY?.trim();
  if (!value) {
    throw new Error("transcribeAudioChunk: OPENAI_API_KEY is required");
  }

  return value;
}

async function fetchAudioBlob(audioUrl: URL, mimeType: string): Promise<Blob> {
  const response = await fetch(audioUrl);
  if (!response.ok) {
    throw new Error(
      `transcribeAudioChunk: failed to download audio (${response.status} ${response.statusText})`,
    );
  }

  return new Blob([await response.arrayBuffer()], {
    type: response.headers.get("content-type") ?? mimeType,
  });
}

async function readJsonResponse(response: Response, label: string): Promise<unknown> {
  if (response.ok) {
    return response.json();
  }

  // Provider bodies can echo prompts, transcript fragments, or credentials.
  // Keep the thrown error useful for classification without carrying that body
  // into job failures or logs.
  await response.body?.cancel();
  throw new Error(`${label} failed (${response.status} ${response.statusText})`);
}

function audioFilename(mimeType: string): string {
  const extension = mimeType.split("/")[1]?.split(";")[0] || "webm";
  return `audio-chunk.${extension}`;
}

function normalizeTranscriptText(value: string): string {
  return value
    .replace(/^```(?:text)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
