# infra

This directory records the planned production topology; it does not contain deployment manifests or prove that an environment is deployed.

- **Planned web:** Vercel or Netlify hosting for the Vite static build.
- **Planned worker:** Railway or Fly for the Node/TS API and background worker.
- **Production dependency:** Supabase provides Postgres, pgvector, Realtime, Auth, and Storage; pg-boss uses the same Postgres database.

No Python/FastAPI/uv in this stack (see `docs/product-spec.md` decision D3, reaffirmed for the LangSmith/telemetry question).

Local and hosted environments are configured outside this directory. Apply `packages/db` migrations to a Supabase database, create the documented storage buckets, and provide the server/client environment variables from `.env.example`; see the root `AGENTS.md` for the local Supabase grant caveat.
