# Removed unwired web UI

This inventory records visible web surfaces removed because they presented mock data, had no working action, or had no real store/backend path. It is a restoration guide, not an MVP commitment.

| Removed surface | Where it appeared | Intended future purpose | Contract or backend path needed to restore it |
|---|---|---|---|
| Weekly participation insight and next-session card | Teacher dashboard | Summarize engagement and upcoming scheduled classes | Persisted session telemetry plus a scheduling/calendar model keyed to the teacher and class |
| Session analytics page | Teacher sidebar and `/teacher/analytics` | Show live retention, friction, completion, student progress, and interventions | Aggregated assignment/event queries with defined retention and friction calculations; real student rows; an intervention mutation; loading, empty, and error states |
| Mock lesson insights, engagement pulse, suggested activity name, simulated waveform, and fixed countdown | Live class monitor | Visualize worker analysis and live audio/session state | `lesson_state` is already the source for topic/objective/evidence; engagement needs a defined telemetry aggregation; audio visualization needs analyser input from the active media stream; activity names must come from verified candidates; timing needs a real session limit if one is introduced |
| Inert pause control and transcript promise | Live class monitor recorder | Pause recording and display a live transcript | Recorder pause/resume behavior plus a transcript read contract. The current contract intentionally sends bounded `lesson_state`, not raw transcript, downstream |
| Average participation, 64% “current focus,” date filter, analytics shortcut, and simulated recording player | Previous classes | Filter sessions, summarize measured participation, open analytics, and replay stored audio | Persisted session timestamps and telemetry aggregates; a real analytics route; authorized audio storage URL plus playback state |
| Recent-activities and support sidebar actions | Teacher sidebar | Open recent activity history and support | Registered routes backed by activity/event history, and a working support destination or handler |
| Password recovery action | Teacher login | Send a reset-password flow | Supabase `resetPasswordForEmail`, redirect/update-password UI, and success/error handling |
| Student progress dashboard | Student sidebar and `/student/progreso` | Show completion, correctness, attempts, hints, mastery, level, and points | Authorized per-student assignment/event aggregation. Assignment status alone cannot supply correctness, attempts, hints, mastery, levels, or points |
| Unsupported help topics and analytics links | Teacher help center | Explain analytics, settings, notes/evidence, and teaching-advice features | Restore only alongside the corresponding working routes/actions and data contracts |

Preserved intentionally: class creation and sharing, audio/manual `lesson_state` ingestion, verified candidate approval and student delivery, real store-backed class/session details, honest loading/empty/error states, and the `maestra@kobi.test` demo history used for the verified manual demo path.
