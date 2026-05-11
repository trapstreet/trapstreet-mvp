# Deploy

> Stack: Vercel + Neon Postgres. Production domain: `https://trapstreet.run`.

## One-time setup

### 1. Push to GitHub

This repo already lives at `AntiNoise-ai/trapstreet-mvp`. Make sure `main`
has the implementation:

```bash
git push origin main
```

### 2. Import to Vercel

1. Go to https://vercel.com/new
2. Select `AntiNoise-ai/trapstreet-mvp`
3. Vercel auto-detects Next.js. Defaults are fine:
   - Build command: `pnpm build`
   - Output: `.next`
   - Install: `pnpm install` (uses `pnpm-lock.yaml`)
4. **Don't deploy yet** — set env vars first (below)

### 3. Environment variables in Vercel

In project Settings → Environment Variables, add (mirror of `.env.local`):

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | Neon pooled connection string | Same DB as local is fine for v0 |
| `AUTH_SECRET` | `openssl rand -hex 32` | Generate a NEW one for prod |
| `AUTH_GITHUB_ID` | from GitHub OAuth app | |
| `AUTH_GITHUB_SECRET` | from GitHub OAuth app | |
| `AUTH_GOOGLE_ID` | from Google Cloud Console | |
| `AUTH_GOOGLE_SECRET` | from Google Cloud Console | |

`AUTH_TRUST_HOST` is automatically set by Vercel — don't add it.

### 4. Update OAuth callback URLs (critical)

OAuth providers will reject any callback URL not in their allowlist.

**GitHub** (https://github.com/settings/developers → your OAuth app):
- Add: `https://trapstreet.run/api/auth/callback/github`
- Keep `http://localhost:3000/api/auth/callback/github` for local dev

**Google** (https://console.cloud.google.com → APIs & Services → Credentials → your OAuth client):
- Add to Authorized redirect URIs: `https://trapstreet.run/api/auth/callback/google`
- Keep `http://localhost:3000/api/auth/callback/google` for local dev

### 5. Domain

Vercel project → Settings → Domains → Add `trapstreet.run`.

Vercel gives you DNS instructions. For apex (`trapstreet.run`), you'll
need an **A record** at your registrar (where you bought the domain):

```
@   A   76.76.21.21
```

(If your registrar supports ANAME / ALIAS / CNAME flattening, use that
instead pointing at `cname.vercel-dns.com` — works the same.)

Also add `www`:

```
www   CNAME   cname.vercel-dns.com
```

**This will break the old GitHub Pages landing.** That's expected — the
landing repo is kept as backup but `trapstreet.run` now serves the MVP.

TLS / HTTPS cert is auto-issued by Vercel via Let's Encrypt — usually
under 60 seconds after DNS propagates.

### 6. First deploy

Trigger via dashboard "Deploy" button, or push any commit to `main`.

Watch the build log. First build is ~2 min.

### 7. Production database schema

Schema is already pushed (we ran `pnpm db:push` locally against the same
Neon DB). If you switched to a separate prod Neon branch:

```bash
# locally, point at the prod DATABASE_URL
DATABASE_URL="postgresql://..." pnpm db:push
DATABASE_URL="postgresql://..." pnpm db:seed   # optional, for demo data
```

## Verify

Once deployed:

1. https://trapstreet.run → home with task grid (3 seeded tasks)
2. https://trapstreet.run/api/auth/providers → returns github + google
3. Click "sign in" → bounce through GitHub → land back at home with your
   name in the top right
4. https://trapstreet.run/runners/new → register a runner, save the
   `api_key`
5. From a `trap` solution dir:
   ```bash
   export TRAPSTREET_API_KEY=ts_...
   tp run && tp submit word-count
   ```
   Should print a `view_url` linking to a `scored` run

## After deploy

- Update the trap CLI default `--server` if needed (currently
  `https://trapstreet.run` — already correct)
- Watch Vercel function logs for errors:
  `vercel logs trapstreet-mvp --follow`
- Neon: check connection count under load; pooled URL handles serverless
  fanout

## Preview deployments

Every PR and non-`main` branch gets an automatic preview URL like
`trapstreet-mvp-git-<branch>-<team>.vercel.app`. OAuth callbacks won't
work on these unless you add each one to the provider allowlists — for
preview, you usually just want to verify the build + page rendering, not
OAuth.

## Rolling back

Vercel keeps every deploy. Project → Deployments → pick a previous
working one → "Promote to Production". One click, no rebuild.
