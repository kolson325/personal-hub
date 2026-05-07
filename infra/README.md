# VPS deploy (Docker + Caddy)

## 1) DNS

- Point `DASHBOARD_HOST` (e.g. `dash.yourdomain.com`) to your VPS public IP (A record).

## Fastest (no domain purchase)

You can skip buying a domain by using a wildcard-DNS hostname:

- `personal.<VPS_IP>.nip.io`
- `allsite.<VPS_IP>.nip.io`

Then set:

- `DASHBOARD_HOST="personal.<VPS_IP>.nip.io"`
- `ALLSITE_HUB_HOST="allsite.<VPS_IP>.nip.io"`
- `DASHBOARD_UPSTREAM="dashboard:3000"` (default)

## 2) On the VPS

```bash
git clone <your repo url>
cd <repo>/infra
cp .env.example .env
# edit .env values
docker compose up -d --build
```

### One-command bootstrap (Ubuntu/Debian)

Copy `infra/vps-bootstrap.sh` to the VPS and run it as root, or pipe it via `curl` once it’s in a GitHub repo.

## Redeploy buttons

This stack includes a small `worker` service that polls the database for `redeploy` jobs and runs:

- `git pull --ff-only` (so it picks up the latest code from GitHub)
- `docker compose up -d --build`

It mounts `/var/run/docker.sock`, the repo root, and the `infra/` directory so it can manage the stack.

Important: the worker runs Compose from `/repo/infra` so build contexts like `../dashboard` work.

## Laptop-local dashboard mode (DB stays on your laptop)

If your laptop is on all day and you want **zero dashboard DB storage on the VPS**, you can run the dashboard on your laptop and use the VPS only as:
- HTTPS reverse proxy (Caddy)
- Allsite hub host

VPS `.env`:
- `DASHBOARD_UPSTREAM="host.docker.internal:7000"`

Laptop:
- run dashboard on `localhost:3000`
- run `infra/laptop-reverse-tunnel.sh` to forward VPS `127.0.0.1:7000` → laptop `localhost:3000`

## 3) Companion (optional, runs on your Mac)

The dashboard can accept job results from a local “companion” runner.

In `dashboard/.env.local`, set:

- `DASHBOARD_URL="https://dash.yourdomain.com"`
- `AGENT_TOKEN="(same as VPS)"`
- `COMBINE_REPO_PATH="/absolute/path/to/THE-COMBINE"`

Run:

```bash
cd dashboard
npm run companion
```

Tip: LOCAL-only jobs include:
- `shell` and `combine_scan` jobs queued from `/ai`
- `codex` jobs queued from “Ask Codex” boxes
- `gmail_triage` automation (placeholder)
