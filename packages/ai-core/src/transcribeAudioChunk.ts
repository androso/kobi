import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { URL } from "node:url";

export interface TranscribeAudioChunkInput {
  /** Publicly-fetchable or signed Supabase Storage URL for the audio chunk. */
  audioUrl: string;
  mimeType: string;
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
  const { text } = await generateText({
    model: google("gemini-2.0-flash"),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Transcribe this classroom audio segment verbatim, in Spanish. Return only the transcript text, no commentary.",
          },
          { type: "file", data: new URL(input.audioUrl), mimeType: input.mimeType },
        ],
      },
    ],
  });

  return { transcriptText: text };
}
