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
