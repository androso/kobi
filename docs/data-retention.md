# Classroom data retention

Kobi treats signed audio URLs as bearer credentials and raw classroom speech as sensitive data. Production logs may contain stable row/session identifiers, provider names, byte counts, durations, latency, and bounded outcome categories; they must never contain signed URLs, URL query strings, tokens, transcript text, transcript-bearing prompts, provider response bodies, or student names.

## Retention periods and ownership

| Data | Default | Deletion owner | Behavior |
|---|---:|---|---|
| Raw audio objects | 7 days | Worker retention job; Storage lifecycle is an 8-day backstop | The worker deletes the object and replaces `audio_chunks.storage_path` with `deleted`. |
| Raw transcript text | 14 days | Worker retention job | `audio_chunks.transcript_text` is set to `null`; the chunk audit row remains. |
| Lesson-state summaries | 90 days | Worker retention job | `segments` rows, including `lesson_state` and `transcript_summary`, are deleted. |
| Aggregate reports | 365 days | Product/data owner | Session, assignment, event, and report inputs are preserved by classroom-data cleanup; a later aggregate-report job may apply this independent period. |

The defaults can be changed with `RAW_AUDIO_RETENTION_DAYS`, `RAW_TRANSCRIPT_RETENTION_DAYS`, `LESSON_STATE_RETENTION_DAYS`, and `AGGREGATE_REPORT_RETENTION_DAYS`. Changing raw-audio retention also requires updating the Storage lifecycle backstop so it remains one day longer than the worker period.

## Automated cleanup and failures

`retention-cleanup` runs daily at `03:17` by default (`RETENTION_CLEANUP_CRON`). pg-boss retries failures five times with exponential backoff. Every run writes `retention_deletion_attempts`; failed rows keep a sanitized `error_category`, so operators can alert on `status = 'failed'` without storing provider or classroom content.

Apply `packages/db/migrations/0011_classroom_data_retention.sql`, then configure the Supabase S3-compatible `audio-chunks` bucket with `infra/audio-bucket-lifecycle.json`. The lifecycle expires objects after eight days and is a backstop for missed worker runs; the worker remains responsible for clearing database paths and transcripts. With Supabase's S3 endpoint configured in the AWS CLI, apply it with:

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket audio-chunks \
  --lifecycle-configuration file://infra/audio-bucket-lifecycle.json \
  --endpoint-url "$SUPABASE_S3_ENDPOINT"
```

## Manual deletion

Set `RETENTION_ADMIN_TOKEN` to a random value of at least 32 characters, then call `DELETE /api/sessions/:id/classroom-data` with `Authorization: Bearer <token>`. It immediately deletes that session's raw audio, transcript text, and lesson-state summaries through the same audited service as scheduled cleanup, while preserving aggregate session, assignment, and event records.
