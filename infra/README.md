# infra

- **Web** — Vercel (Next.js app, teacher + student portals + API routes)
- **Worker** — Railway or Fly (Node/TS background worker)
- **Data** — Supabase (Postgres + pgvector + Realtime + Auth) — one datastore, period
- **Queue** — pg-boss on Postgres — no extra infra needed

No Python/FastAPI/uv in this stack (see `docs/product-spec.md` decision D3, reaffirmed for the LangSmith/telemetry question).
