# Repository Hygiene

Run the repository hygiene check before review:

```bash
pnpm check:repo
```

The check scans Git-visible files, including untracked non-ignored files, for accidental terminal dumps, suspicious root artifacts, obvious credentials, and unexpectedly large generated files. It intentionally ignores ignored local secrets such as `.env` files when Git excludes them.

## Generated Assets

Intentional generated assets must stay documented and reproducible:

| Asset | Purpose | Regeneration |
|---|---|---|
| `apps/web/public/auth/*.png` | Login/auth illustration assets used by the Vite web app | `pnpm --filter @kobi/web generate:auth-images` |
| `apps/web/public/class_creation_illustration.jpg` | Class creation illustration used by the web app | Regenerate from the source design/image prompt before replacement; keep the filename stable unless the UI changes too |
| `apps/web/public/local-audio/demo-audio.mp3` | Synthetic prerecorded classroom audio served by Vite for local/demo mode | Replace with another synthetic fixture only; do not commit real classroom recordings |
| `packages/db/drizzle/*.sql` and `packages/db/drizzle/meta/*.json` | Drizzle migration output and schema snapshots | `pnpm --filter @kobi/db db:generate` |
| Static activity artifacts produced by worker dev scripts | Demo/fallback artifact inspection only unless explicitly persisted through the DB artifact tables | `pnpm --filter @kobi/worker generate:static-artifacts` |
| OpenAI activity artifacts produced by worker dev scripts | Development inspection of model-generated candidates; requires model credentials | `pnpm --filter @kobi/worker generate:openai-artifacts` |

Do not commit ad hoc terminal captures, branch lists, downloaded classroom data, or generated files whose source and command are unknown.

## Sample Data

Sample paths must be explicit:

- Seeded teacher history and sample classes must stay visibly labeled and out of production data paths.
- Local prerecorded classroom audio belongs under `apps/web/public/local-audio/` and is gitignored by default; never commit real classroom recordings. The only tracked exception is the synthetic demo fixture `apps/web/public/local-audio/demo-audio.mp3`.
- Fixtures must use synthetic classroom content only. Do not include real student names, real classroom audio/text, access tokens, API keys, database URLs, or Supabase service-role keys.
