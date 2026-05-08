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
  - Includes `siteCatalog` when the updater fetches the SiteFotos “sites tabulator” endpoint.

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
- Drag/drop layout editor: `dashboard/src/app/_components/GridLayoutEditor.tsx` (desktop pointer devices; mobile is view-only)
- “Ask Codex” widget: `dashboard/src/app/_components/AskCodex.tsx`
- Codex chat page: `dashboard/src/app/codex/page.tsx`
- Devotional API: `dashboard/src/app/api/devotional/today/route.ts`
- Devotional fallback list: `dashboard/src/lib/devotional.ts`
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

Site list (“all sites”):
- The UI’s “Needs serviced” + weekly progress are most accurate when the snapshot includes a complete site catalog.
- Some SiteFotos “web UI” endpoints (like the tabulator sites list) may return 404 from server-side calls (they appear to require browser session cookies).
- The reliable approach in this repo is to union site names from **multiple 30‑day windows** of submissions (SiteFotos rejects `submitted` queries > 30 days):
  - `SITE_CATALOG_LOOKBACK_DAYS` (default `365`)
  - `SITE_CATALOG_MAX_WINDOWS` (default `8`)

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
- runs `docker compose up -d` from `/repo/infra` (build is optional)

If redeploy fails, check:
- `infra/docker-compose.yml` → `worker` service mounts:
  - `/var/run/docker.sock`
  - repo at `/repo`
- `dashboard/Dockerfile` includes `git` + `docker` + `docker compose` plugin.

Note on small VPS plans (1GB RAM):
- Building images during a redeploy can cause OOM kills.
- Default behavior is **no build** on redeploy (`REDEPLOY_BUILD=0`).
- When you need to apply code changes, run a manual build on the VPS:
  ```bash
  cd /opt/personal-hub/infra
  docker compose up -d --build
  ```

## 5) Laptop-only storage (important reality check)

If the dashboard is hosted on a VPS, its database lives on the VPS. You can keep it very small, but it’s still stored there.

If you want **all** personal dashboard data stored only on your laptop:
- Run the dashboard on your laptop (SQLite on your disk)
- Expose it to the internet using a tunnel/VPN **or** an SSH reverse tunnel to your VPS (stable URL without buying a domain)

This repo currently supports both patterns:
- VPS mode: always-on access (data stored on VPS volume)
- Laptop mode: storage stays local (availability depends on laptop being online)

### Laptop mode (stable URL via VPS reverse proxy)

Goal: keep the public URL the same (`https://personal.<VPS_IP>.nip.io`) while the dashboard + DB run on your laptop.

On the VPS:
1) Edit `/opt/personal-hub/infra/.env`:
   - `DASHBOARD_UPSTREAM="host.docker.internal:7000"`
2) Restart Caddy:
   ```bash
   cd /opt/personal-hub/infra
   docker compose up -d
   ```
3) (Optional) stop VPS dashboard containers so there’s no VPS storage usage for the dashboard:
   ```bash
   cd /opt/personal-hub/infra
   docker compose stop dashboard worker
   ```

On your laptop:
1) Run the dashboard locally (production-ish):
   ```bash
   cd dashboard
   npm install
   npm run build
   DASHBOARD_PASSWORD="kolson" \
   AGENT_TOKEN="<same as VPS /opt/personal-hub/infra/.env>" \
   ALLSITE_CENTRAL_HUB_URL="https://allsite.<VPS_IP>.nip.io" \
   npm run start
   ```
2) Start the reverse tunnel (keeps it stable and private on the VPS loopback):
   ```bash
   VPS_HOST=root@<VPS_IP> bash infra/laptop-reverse-tunnel.sh
   ```

Now the public URL will serve your laptop-hosted dashboard, and the DB stays on your laptop disk.

## 6) “Ask Codex” / agent integration

The “Ask Codex” boxes queue `AgentJob(kind="codex", runner="LOCAL")`.

UI:
- Codex chat page: `/codex` (conversation view + live “active run” panel)
- Jobs page: `/ai` (non-chat jobs like `shell`, `combine_scan`, notes)

Concurrency rule:
- Only **one** LOCAL Codex run can be active at a time.
- If you submit a second request while one is `QUEUED`/`CLAIMED`, the UI will show:
  “Another Codex run is already in progress — please wait until it finishes.”

Live “thinking”:
- `/codex` uses an SSE stream (`/api/codex/stream`) so the active run updates live as the companion appends progress.

Panel-aware prompts:
- When you submit from a panel (budget / allsite / devotional / tasks), the server attaches a small `panelDataJson` blob so Codex can answer with the panel’s data without you re-explaining it.

To run these jobs on your laptop:
1) Copy `AGENT_TOKEN` from the VPS `.env`:
   - `/opt/personal-hub/infra/.env`
2) On your Mac, create `dashboard/.env.local`:
   - `DASHBOARD_URL="https://personal.<VPS_IP>.nip.io"`
   - `AGENT_TOKEN="..."`
   - `AGENT_ID="kolson-mac"`
    - `COMBINE_REPO_PATH="/absolute/path/to/THE-COMBINE"`
    - Optional (Codex exec):
      - `CODEX_CWD="/absolute/path/to/a/default/repo"`
      - `CODEX_SANDBOX="workspace-write"` (or `read-only`)
3) Run the companion:
```bash
cd dashboard
npm install
npm run companion
```

Codex execution:
- When you approve a `codex` job, the companion runs `codex exec` and streams progress back into `/codex`.
- Make sure Codex CLI is installed and logged in:
  ```bash
  codex login
  ```

The companion will prompt for approval before doing anything sensitive.

## 7) Daily devotional (biblical teaching)

Home shows a small “Daily devotional” card.

By default it uses an offline-safe, deterministic verse list (no external dependencies).

Optional: live “verse of the day” provider:
- Set `DEVOTIONAL_PROVIDER="thebibleapi"` to fetch the daily verse (no API key).
- Optional override: `DEVOTIONAL_THEBIBLEAPI_URL="..."`.
