import { afterEach, describe, expect, it, vi } from "vitest";
import { decodePrerecordedAudio } from "./prerecordedAudio";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("decodePrerecordedAudio", () => {
  it("downmixes decoded audio into independently valid 15-second WAV chunks", async () => {
    const close = vi.fn(async () => undefined);
    const decodeAudioData = vi.fn(async () => ({
      duration: 20,
      length: 40,
      numberOfChannels: 2,
      sampleRate: 2,
      getChannelData: (channel: number) =>
        channel === 0 ? new Float32Array(40).fill(0.5) : new Float32Array(40).fill(-0.5),
    }));
    class FakeAudioContext {
      decodeAudioData = decodeAudioData;
      close = close;
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);

    const chunks = await decodePrerecordedAudio(new Uint8Array([1, 2, 3]).buffer, 15_000);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ chunkIndex: 0, startMs: 0, endMs: 15_000 });
    expect(chunks[1]).toMatchObject({ chunkIndex: 1, startMs: 15_000, endMs: 20_000 });
    expect(chunks[0]?.audio.type).toBe("audio/wav");
    expect(await chunks[0]?.audio.slice(0, 4).text()).toBe("RIFF");
    expect(await chunks[1]?.audio.slice(8, 12).text()).toBe("WAVE");
    expect(close).toHaveBeenCalled();
  });

  it("rejects an empty fixture before opening the decoder", async () => {
    await expect(decodePrerecordedAudio(new ArrayBuffer(0), 15_000)).rejects.toThrow(
      "esta vacio",
    );
  });
});
