# infra

- **Web** — Vercel or Netlify (Vite + React app, teacher + student portals)
- **Worker** — Railway or Fly (Node/TS background worker)
- **Data** — Supabase (Postgres + pgvector + Realtime + Auth) — one datastore, period
- **Queue** — pg-boss on Postgres — no extra infra needed

No Python/FastAPI/uv in this stack (see `docs/product-spec.md` decision D3, reaffirmed for the LangSmith/telemetry question).

Production backup, retention, recovery objectives, scenario runbooks, and the isolated restore audit are defined in [`docs/data-lifecycle-and-disaster-recovery.md`](../docs/data-lifecycle-and-disaster-recovery.md). The quarterly GitHub workflow verifies a restored Supabase project; it does not receive or mutate production credentials.
