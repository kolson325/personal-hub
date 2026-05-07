# Kolson’s Dashboard + Allsite Hub

This repo contains:

- `dashboard/`: Kolson’s personal dashboard (Next.js + Prisma + SQLite) with tasks, automations, budget, agent panels, and deploy controls.
- `allsitehub/`: Allsite site-photos hub (Express) with snapshot updater + summary API.
- `infra/`: Deployment (Docker Compose + Caddy HTTPS reverse proxy) for VPS (Linode) or local use.

Fastest path to “public HTTPS without buying a domain” (VPS):

- Deploy to a VPS with a static public IPv4.
- Use `sslip.io` or `nip.io` with the embedded IP (example: `http://1-2-3-4.sslip.io`), and set that hostname as `DASHBOARD_HOST` for Caddy.

Docs:
- `infra/README.md` (deploy/redeploy)
- `docs/OPERATION.md` (how everything works + where to edit)
