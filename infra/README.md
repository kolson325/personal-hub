# VPS deploy (Docker + Caddy)

## 1) DNS

- Point `DASHBOARD_HOST` (e.g. `dash.yourdomain.com`) to your VPS public IP (A record).

## 2) On the VPS

```bash
git clone <your repo url>
cd <repo>/infra
cp .env.example .env
# edit .env values
docker compose up -d --build
```

## Redeploy buttons

This stack includes a small `worker` service that polls the database for `redeploy` jobs and runs `docker compose up -d`.
It mounts `/var/run/docker.sock` and the `infra/` directory so it can manage the stack.

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
