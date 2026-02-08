# Cloud Deployment Guide (Railway)

This guide covers deploying the GitLab CI Dashboard in **cloud mode** (`AUTH_MODE=supabase`) on [Railway](https://railway.app), powering `app.cidash.dev`.

---

## 1. Prerequisites

- **Railway account** with a paid plan (for persistent volumes and custom domains)
- **Supabase project** -- the same project used by `cidash.dev` (shared auth)
- **Domain**: `app.cidash.dev` pointed at Railway
- **Docker image**: `ismoilovdevml/gitlab-ci-dashboard:latest` published to Docker Hub
- Railway CLI installed: `npm i -g @railway/cli` and authenticated via `railway login`

---

## 2. Railway Setup

### Initialize project

```bash
railway init
# Select or create a project (e.g. "gitlab-ci-dashboard")
```

### Add PostgreSQL plugin

```bash
railway add -p postgresql
```

Railway provisions a managed PostgreSQL instance and exposes `DATABASE_URL` automatically.

### Add Redis plugin

```bash
railway add -p redis
```

Railway provisions a managed Redis instance and exposes `REDIS_URL` automatically.

### Link your local repo

```bash
cd /path/to/gitlab-ci-dashboard
railway link
# Select the project and service
```

---

## 3. Environment Variables

Set these on the Railway service (via dashboard or CLI):

```bash
# Railway auto-provides DATABASE_URL and REDIS_URL from plugins.
# If using docker-compose.cloud.yml instead, set them manually.

# --- App ---
railway variables set NODE_ENV=production
railway variables set NEXT_PUBLIC_APP_URL=https://app.cidash.dev

# --- Auth Mode (cloud) ---
railway variables set AUTH_MODE=supabase
railway variables set NEXT_PUBLIC_AUTH_MODE=supabase

# --- Supabase (same project as cidash.dev) ---
railway variables set SUPABASE_URL=https://<project-ref>.supabase.co
railway variables set SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
railway variables set NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
railway variables set NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>

# --- Security ---
railway variables set SESSION_SECRET=<random-64-char-string>
railway variables set TOKEN_ENCRYPTION_KEY=<32-byte-hex-key>
railway variables set CLOUD_WEBHOOK_SECRET=<shared-secret-with-web-platform>

# --- Admin (fallback, used by seed script) ---
railway variables set ADMIN_USERNAME=admin
railway variables set ADMIN_PASSWORD=<strong-password>
railway variables set ADMIN_EMAIL=admin@cidash.dev
```

### Variable reference

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string (auto-set by Railway plugin) |
| `REDIS_URL` | Yes | Redis connection string (auto-set by Railway plugin) |
| `NODE_ENV` | Yes | Must be `production` |
| `NEXT_PUBLIC_APP_URL` | Yes | Public URL of the dashboard (`https://app.cidash.dev`) |
| `AUTH_MODE` | Yes | Set to `supabase` for cloud mode |
| `NEXT_PUBLIC_AUTH_MODE` | Yes | Set to `supabase` (client-side) |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side only) |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL (client-side) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key (client-side) |
| `SESSION_SECRET` | Yes | Secret for session signing |
| `TOKEN_ENCRYPTION_KEY` | Yes | 32-byte hex key for encrypting GitLab tokens at rest |
| `CLOUD_WEBHOOK_SECRET` | Yes | Shared secret between cidash.dev web platform and this dashboard |
| `ADMIN_USERNAME` | No | Fallback admin username (default: `admin`) |
| `ADMIN_PASSWORD` | Yes | Fallback admin password |
| `ADMIN_EMAIL` | No | Fallback admin email (default: `admin@cidash.dev`) |

---

## 4. Deploy

### Option A: Railway CLI (from Dockerfile)

```bash
railway up
```

Railway reads `railway.toml`, builds the Dockerfile, and deploys. The start command runs Prisma migrations and seeds before starting the server.

### Option B: Docker Compose (any Docker host)

For non-Railway deployments, use the cloud compose file:

```bash
# Copy .env.example and fill in values
cp .env.example .env
# Edit .env with your values

docker compose -f docker-compose.cloud.yml up -d
```

---

## 5. Custom Domain

### Add domain on Railway

```bash
railway domain
# Or via Railway dashboard: Settings > Domains > Add Custom Domain
```

### DNS configuration

Add a CNAME record for your domain:

```
app.cidash.dev  CNAME  <your-project>.up.railway.app
```

Railway automatically provisions an SSL certificate once DNS propagates.

---

## 6. Post-Deploy Verification

### Health check

```bash
curl -s https://app.cidash.dev/api/version | jq .
```

Expected response:

```json
{
  "version": "1.3.0",
  "status": "ok"
}
```

### Webhook endpoint health

```bash
curl -s https://app.cidash.dev/api/webhook/cloud
```

A GET request returns a health/status response confirming the webhook endpoint is reachable.

### Database migration status

Check Railway logs to confirm migrations ran:

```bash
railway logs
```

Look for:

```
Running migrations...
Starting cloud dashboard...
```

---

## 7. Web Platform Integration

On the **cidash.dev** web platform (the Supabase-powered marketing/billing site), set these environment variables to connect it to the deployed dashboard:

```bash
CLOUD_APP_URL=https://app.cidash.dev
CLOUD_WEBHOOK_SECRET=<same-secret-as-dashboard>
```

This allows the web platform to:
- Provision dashboard instances for users via webhook
- Sync subscription/license status
- Forward user actions to the dashboard API

---

## 8. Useful Commands

### View logs

```bash
railway logs
railway logs --follow
```

### Restart service

```bash
railway service restart
```

### Redeploy (rebuild from latest code)

```bash
railway up
```

### Open Railway dashboard

```bash
railway open
```

### Check service status

```bash
railway status
```

### Connect to database (for debugging)

```bash
railway connect postgresql
```

### Run one-off commands

```bash
railway run npx prisma studio
railway run npx prisma db push
```

---

## File Overview

| File | Purpose |
|---|---|
| `railway.toml` | Railway build and deploy configuration |
| `docker-compose.yml` | Self-hosted deployment (AUTH_MODE=credentials) |
| `docker-compose.cloud.yml` | Cloud deployment (AUTH_MODE=supabase) |
| `docker-compose.local.yml` | Local development (postgres + redis only) |
| `Dockerfile` | Multi-stage production build |
