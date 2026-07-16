export interface PrerecordedAudioChunk {
  audio: Blob;
  chunkIndex: number;
  startMs: number;
  endMs: number;
}

export async function decodePrerecordedAudio(
  source: ArrayBuffer,
  chunkMs: number,
): Promise<PrerecordedAudioChunk[]> {
  if (source.byteLength === 0) {
    throw new Error("El archivo de audio configurado esta vacio.");
  }

  const AudioContextConstructor = window.AudioContext;
  if (!AudioContextConstructor) {
    throw new Error("Este navegador no soporta la decodificacion del audio pregrabado.");
  }

  const context = new AudioContextConstructor();
  try {
    const decoded = await context.decodeAudioData(source.slice(0));
    if (decoded.length === 0 || decoded.duration <= 0) {
      throw new Error("El archivo de audio configurado no contiene audio util.");
    }

    const sourceMono = downmixToMono(decoded);
    const sampleRate = Math.min(decoded.sampleRate, 16_000);
    const mono = resampleMono(sourceMono, decoded.sampleRate, sampleRate);
    const framesPerChunk = Math.max(1, Math.floor(sampleRate * chunkMs / 1_000));
    const chunks: PrerecordedAudioChunk[] = [];

    for (let startFrame = 0, chunkIndex = 0; startFrame < mono.length; startFrame += framesPerChunk, chunkIndex += 1) {
      const endFrame = Math.min(startFrame + framesPerChunk, mono.length);
      chunks.push({
        audio: encodeMonoWav(mono.subarray(startFrame, endFrame), sampleRate),
        chunkIndex,
        startMs: Math.round(startFrame / sampleRate * 1_000),
        endMs: Math.round(endFrame / sampleRate * 1_000),
      });
    }

    return chunks;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("El archivo")) throw error;
    throw new Error("No se pudo decodificar el MP3 configurado.");
  } finally {
    await context.close();
  }
}

function downmixToMono(buffer: AudioBuffer): Float32Array {
  const mono = new Float32Array(buffer.length);
  for (let channelIndex = 0; channelIndex < buffer.numberOfChannels; channelIndex += 1) {
    const channel = buffer.getChannelData(channelIndex);
    for (let frame = 0; frame < channel.length; frame += 1) {
      mono[frame] += channel[frame]! / buffer.numberOfChannels;
    }
  }
  return mono;
}

function resampleMono(samples: Float32Array, sourceRate: number, targetRate: number) {
  if (sourceRate === targetRate) return samples;
  const outputLength = Math.max(1, Math.round(samples.length * targetRate / sourceRate));
  const output = new Float32Array(outputLength);
  const ratio = sourceRate / targetRate;

  for (let index = 0; index < outputLength; index += 1) {
    const sourcePosition = index * ratio;
    const lowerIndex = Math.floor(sourcePosition);
    const upperIndex = Math.min(lowerIndex + 1, samples.length - 1);
    const weight = sourcePosition - lowerIndex;
    output[index] = samples[lowerIndex]! * (1 - weight) + samples[upperIndex]! * weight;
  }
  return output;
}

function encodeMonoWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const dataLength = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataLength, true);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]!));
    view.setInt16(44 + index * bytesPerSample, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}
