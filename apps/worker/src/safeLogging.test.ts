import { describe, expect, it } from "vitest";
import { classifySafeError, sanitizeLogDetails } from "@kobi/ai-core";

describe("classroom-safe logging", () => {
  it("redacts signed URLs, transcript fragments, names, tokens, and provider bodies", () => {
    const details = sanitizeLogDetails({
      audioUrl: "https://storage.example/audio.webm?token=secret&sig=credential",
      transcriptText: "La alumna Maria dijo que vive en Santa Ana",
      studentName: "Maria Hernandez",
      authorization: "Bearer sk-secret",
      providerResponseBody: '{"text":"Maria dijo..."}',
      message: "download https://example.test/file?token=secret failed",
      audioChunkId: "chunk-123",
      sizeBytes: 4096,
    });

    expect(JSON.stringify(details)).not.toMatch(/Maria|Santa Ana|secret|credential|dijo/);
    expect(details.audioChunkId).toBe("chunk-123");
    expect(details.sizeBytes).toBe(4096);
    expect(details.message).toBe("download [REDACTED_URL] failed");
  });

  it("keeps allowed measurements while redacting transcript-bearing values", () => {
    expect(sanitizeLogDetails({ transcriptBytes: 128, durationMs: 900 }).transcriptBytes).toBe(128);
  });

  it("maps provider errors to bounded categories without exposing their bodies", () => {
    expect(classifySafeError(new Error("429 response: transcript for Maria"))).toBe("rate_limit");
    expect(classifySafeError(new Error("provider returned 503 with raw body"))).toBe("provider_unavailable");
  });
});
