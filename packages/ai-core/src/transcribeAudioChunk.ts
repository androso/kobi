import { google } from "@ai-sdk/google";
import { generateText } from "ai";

const DEFAULT_TRANSCRIPTION_MODEL = "gemini-2.0-flash";

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
 * Area A, stage 1: turn one 45-60s audio chunk into plain text via Gemini's
 * audio-understanding endpoint. Chunked, not streamed — see D-notes on
 * chunked vs. Live API in docs/area-bc-contract.md.
 */
export async function transcribeAudioChunk(
  input: TranscribeAudioChunkInput,
): Promise<TranscribeAudioChunkResult> {
  const audioUrl = parseAudioUrl(input.audioUrl);
  const mimeType = normalizeMimeType(input.mimeType);

  const { text } = await generateText({
    model: google(input.model ?? DEFAULT_TRANSCRIPTION_MODEL),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Transcribe this classroom audio segment verbatim, in Spanish. Return only the transcript text, no commentary.",
          },
          { type: "file", data: audioUrl, mimeType },
        ],
      },
    ],
  });

  const transcriptText = normalizeTranscriptText(text);
  if (!transcriptText) {
    throw new Error("transcribeAudioChunk: model returned an empty transcript");
  }

  return { transcriptText };
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

function normalizeTranscriptText(value: string): string {
  return value
    .replace(/^```(?:text)?/i, "")
    .replace(/```$/i, "")
    .trim();
}
