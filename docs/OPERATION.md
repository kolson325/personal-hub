# How this repo works (and how to edit/deploy)

## 0) Recommended IDE + prerequisites

- IDE: VS Code (works great for Next.js + Node).
- Node.js: v20+ (this repo is tested with Node 20).
- Package manager: npm (already used by the repo).

## 1) What runs where (architecture)

### Personal dashboard (`dashboard/`)

- Next.js app that renders the UI.
- Prisma + SQLite for storage:
  - Todos, agent runs, job queue, services list, automations, budget entries.
- Auth:
  - Simple password login stored as a cookie hash (env `DASHBOARD_PASSWORD`).
- “Agents” model:
  - The UI queues work into `AgentJob` rows.
  - A runner picks jobs up and reports results back.

Runners:
- VPS runner: `dashboard/worker/worker.mjs` (runs inside the `worker` container).
- Laptop runner (optional): `dashboard/companion/agent.mjs` (runs on your Mac and polls the server for `runner=LOCAL` jobs).

### Allsite hub (`allsitehub/`)

- Express server (serves UI from `allsitehub/public/`).
- Snapshot updater:
  - Writes `snapshot.json` under `/app/data` (mounted volume).
  - Public update endpoint: `POST /api/update`
  - Status: `GET /api/update/status`
- Summary API:
  - `GET /api/summary` returns computed periods (today/yesterday/week/month) and a tracking calendar.

Tracking calendar:
- Month 1 starts **April 1**
- Week 1 is **Apr 1–Apr 10**
- Weeks after that are **Mon–Fri** windows
- Configurable via env:
  - `TRACKING_START_DATE` (default `2026-04-01`)
  - `TRACKING_WEEK1_END_DATE` (default `2026-04-10`)

### Infra (`infra/`)

- Docker Compose runs:
  - `dashboard` (Next.js)
  - `worker` (job runner + automations scheduler)
  - `allsitehub` (Allsite hub)
  - `caddy` (HTTPS reverse proxy)

## 2) Editing locally (dev)

### Dashboard

```bash
cd dashboard
npm install
npm run dev
```

Open: `http://localhost:3000`

Key files:
- Home layout: `dashboard/src/app/page.tsx`
- Navigation component: `dashboard/src/app/_components/TopNav.tsx`
- “Ask Codex” widget: `dashboard/src/app/_components/AskCodex.tsx`
- Automations UI: `dashboard/src/app/automations/page.tsx`
- Budget UI: `dashboard/src/app/budget/page.tsx`
- Inbox UI: `dashboard/src/app/inbox/page.tsx`

Database schema:
- `dashboard/prisma/schema.prisma`

After schema changes:
```bash
cd dashboard
npx prisma generate
npm run build
```

### Allsite hub

```bash
cd allsitehub
npm install
npm run dev
```

Open: `http://localhost:4545`

Key files:
- Server: `allsitehub/server.js`
- Updater: `allsitehub/updater.js`
- Summary algorithm: `allsitehub/lib/summary.js`
- Frontend UI: `allsitehub/public/app.js`

## 3) Deploying (VPS / Linode)

The VPS uses:
- Caddy for HTTPS
- `nip.io` hostnames (domainless): `personal.<VPS_IP>.nip.io`, `allsite.<VPS_IP>.nip.io`

Typical deploy flow:
1) Push changes to GitHub (main branch)
2) VPS pulls + rebuilds via Docker Compose

Manual deploy on VPS:
```bash
ssh root@<VPS_IP>
cd /opt/personal-hub
git pull --ff-only
cd infra
docker compose up -d --build
```

## 4) One-click redeploy buttons

The dashboard “Deploy” page queues a `redeploy` job.

The VPS `worker` container:
- runs `git pull` in `/repo`
- runs `docker compose up -d --build` from `/repo/infra`

If redeploy fails, check:
- `infra/docker-compose.yml` → `worker` service mounts:
  - `/var/run/docker.sock`
  - repo at `/repo`
- `dashboard/Dockerfile` includes `git` + `docker` + `docker compose` plugin.

## 5) Laptop-only storage (important reality check)

If the dashboard is hosted on a VPS, its database lives on the VPS. You can keep it very small, but it’s still stored there.

If you want **all** personal dashboard data stored only on your laptop:
- Run the dashboard on your laptop (SQLite on your disk)
- Expose it to the internet using a tunnel (Cloudflare Tunnel / localtunnel) or a VPN

This repo currently supports both patterns:
- VPS mode: always-on access (data stored on VPS volume)
- Laptop mode: storage stays local (availability depends on laptop being online)

## 6) “Ask Codex” / agent integration

The “Ask Codex” boxes queue `AgentJob(kind="codex", runner="LOCAL")`.

To run these jobs on your laptop:
1) Copy `AGENT_TOKEN` from the VPS `.env`:
   - `/opt/personal-hub/infra/.env`
2) On your Mac, create `dashboard/.env.local`:
   - `DASHBOARD_URL="https://personal.<VPS_IP>.nip.io"`
   - `AGENT_TOKEN="..."`
   - `AGENT_ID="kolson-mac"`
   - `COMBINE_REPO_PATH="/absolute/path/to/THE-COMBINE"`
3) Run the companion:
```bash
cd dashboard
npm install
npm run companion
```

The companion will prompt for approval before doing anything sensitive.

