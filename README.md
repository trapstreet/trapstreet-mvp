# trapstreet-mvp

Public benchmark for AI workflows. **MVP repo.**

> Runner picks a Mission under a Track, opens a Run, runs it, server scores it,
> the result lands on the Leaderboard. Everyone discusses on Threads.

## Documentation

- [docs/glossary.md](./docs/glossary.md) — every word in trapstreet, defined once
- [docs/api-v0.md](./docs/api-v0.md) — 11 endpoints, 5 resources, run state machine, MCP/Skill mappings

## Status

V0 — speedrun. Postgres + GitHub/Google OAuth are wired up. Real
graders, file storage, and tier badges still mocked.

Stack: Next.js 15 (app router) · React 19 · TS · Tailwind v4 ·
Drizzle ORM · Neon Postgres · Auth.js v5 (JWT).

## Setup

### 1. Database (Neon, free)

1. Sign up at [neon.tech](https://neon.tech) and create a project.
2. Copy the **pooled** connection string from the dashboard.

### 2. OAuth apps

**GitHub** — github.com/settings/developers → New OAuth App
- Homepage: `http://localhost:3000`
- Callback: `http://localhost:3000/api/auth/callback/github`

**Google** — console.cloud.google.com → APIs & Services → Credentials
→ OAuth client ID → Web application
- Redirect URI: `http://localhost:3000/api/auth/callback/google`

### 3. Local env

```bash
cp .env.example .env.local
# fill in DATABASE_URL, AUTH_SECRET (= openssl rand -hex 32),
# AUTH_GITHUB_ID/SECRET, AUTH_GOOGLE_ID/SECRET
```

### 4. Install + setup db + run

```bash
pnpm install --ignore-workspace
pnpm db:setup    # = drizzle-kit push + seed
pnpm dev         # http://localhost:3000
```

`db:setup` is idempotent — re-running won't duplicate seed rows.

## What's wired up

- **all 11 endpoints** from `docs/api-v0.md` under `src/app/api/*`
- **OAuth login** — GitHub + Google, JWT session, lightweight `users`
  row written on first signin
- **runner ownership** — `/runners/new` requires login; new runners are
  linked to your user via `runners.user_id`. API-key auth on write
  endpoints still works for CLI/CI use.
- **6 pages**: leaderboard (`/`), tasks (`/tasks`, `/tasks/[id]`), run
  detail (`/runs/[id]`), threads (`/threads`, `/threads/[id]`), runner
  registration (`/runners/new`)
- **seeded data**: 3 tasks across 2 tracks, 3 runners, 6 runs (5 scored
  + 1 failed), 2 threads with comments
- **mock grader**: `PATCH /api/runs/:id status=succeeded` synchronously
  advances to `scored` with a deterministic score derived from the run id

## What's deliberately not in v0

- real graders — `mockScoreRun()` produces fake-but-stable scores
- real object storage — `/api/uploads/[run_id]` and `/api/files/...` are
  stubs that no-op
- async scoring — v0 collapses `succeeded → scored` into one PATCH
- JSON Schema validation of output
- file uploads, hidden tasks, signing, tier badges — all in
  `docs/api-v0.md` Appendix C
- api_key hashing — stored plaintext in the DB; rotate to hashes (e.g.
  Argon2) when leaving v0

## Deploying to Vercel

1. Push this repo to GitHub.
2. Import in Vercel → it auto-detects Next.js.
3. Set env vars (same as `.env.local`) in Vercel dashboard. **Update
   OAuth callback URLs** to your Vercel domain:
   - `https://your-app.vercel.app/api/auth/callback/github`
   - `https://your-app.vercel.app/api/auth/callback/google`
4. Vercel sets `AUTH_TRUST_HOST` automatically — no extra config needed.
5. After first deploy, run `pnpm db:push` against the production
   `DATABASE_URL` (or run it locally with prod URL set), then
   `pnpm db:seed` if you want seed rows in prod.
