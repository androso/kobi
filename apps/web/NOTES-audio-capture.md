# Frontend notes: teacher mic capture (Area A, not built yet)

This is the contract for the teacher live-session screen (screen 2 in `docs/product-spec.md`). The worker-owned HTTP API now exposes the upload/session endpoints; the Vite web app calls that API instead of defining Next.js routes.

## Flow

```
Teacher mic
  -> MediaRecorder chunks every ~15s
  -> POST {VITE_KOBI_API_URL}/api/sessions/:id/audio-chunks
  -> save chunk metadata + upload audio to Supabase Storage
  -> enqueue "transcribe-chunk" pg-boss job
  -> worker transcribes, builds lesson_state, retrieves curriculum matches
  -> (not built yet) Supabase Realtime pushes the lesson_state card to this UI
```

## Recording

Use the browser-native `MediaRecorder` + `getUserMedia` APIs — no extra library needed for v0. Implemented in `apps/web/src/features/teacher/LiveClassMonitor.tsx`: a single `getUserMedia` stream stays open for the whole session, but instead of one long-lived `MediaRecorder` with a `timeslice`, a new `MediaRecorder` instance is stopped and restarted on that same stream every `AUDIO_CHUNK_MS` (`rotateRecorderSegment` / `startNewRecorderSegment`). This matters because most browsers only put the container header in the *first* `ondataavailable` blob of a given `MediaRecorder` instance — later timeslice blobs from the same instance aren't independently decodable. Since each chunk is uploaded and transcribed on its own, every chunk must come from its own recorder instance to guarantee it's a complete, standalone file.

- Chunk length: ~15 seconds (`AUDIO_CHUNK_MS` in `LiveClassMonitor.tsx`).
- Format: use a browser-native audio format accepted by the OpenAI transcription API (for example, `audio/webm`); no client-side transcoding is needed for supported formats.

For local prerecorded demonstrations, set `VITE_KOBI_RECORDING_SOURCE=prerecorded` and place the classroom MP3 at `apps/web/public/local-audio/classroom.mp3` (or configure `VITE_KOBI_PRERECORDED_AUDIO_PATH`). The browser decodes the file without playing it, downmixes it to mono, creates standalone 15-second WAV chunks, and uploads one every 2.1 seconds through the same endpoint. MP3 fixtures in that directory are gitignored because classroom audio must not be committed.

## `POST /api/sessions/:id/audio-chunks`

This route handler is implemented in `apps/worker/src/api.ts`. It:

1. Accept the audio blob as `multipart/form-data` plus `chunk_index`, `start_ms`, `end_ms`.
2. Upload the blob to Supabase Storage, get back a path/URL.
3. Insert a row into `audio_chunks` with `status: 'pending'`.
4. Enqueue a `transcribe-chunk` pg-boss job with `{ audioChunkId, audioUrl, mimeType, sessionId }` — matches `apps/worker/src/jobs/transcribeChunk.job.ts`'s expected job data shape exactly.

Response: `{ audioChunkId }` is enough for the client to show "chunk N uploaded" status.

## Manual fallback UX (D6 — this is a feature, not just a fallback)

Add one button on the live-session screen:

> **No se detectó bien la clase → Escribir tema manualmente**

Form fields:
- Tema que estás dando (required)
- Página / unidad (optional)
- Objetivo (optional)

On submit, call `lessonStateFromManualEntry({ topic, objective })` from `@kobi/ai-core` (already implemented) to get a `LessonState` object with `confidence: 1`, then insert it directly as a `segments` row — this bypasses `apps/worker` entirely since there's no transcript to process, but produces the exact same shape everything downstream expects.

## Lesson-state card UI

Once Realtime wiring exists, render each new `segments.lesson_state` as a card like:

> Tema detectado: El sustantivo
> Objetivo probable: Reconocer sustantivos comunes y propios
> Confianza: 86%

Don't show the raw transcript in this UI — only ever `lesson_state` (topic/objective_guess/confidence/key_terms), per the "raw transcript never travels downstream" rule in `docs/product-spec.md`.
