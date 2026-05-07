# Personal + Allsite Dashboard Stack (MVP)

This repo contains:

- `dashboard/`: Personal dashboard web app (login-protected) with panels for Central Hub, TODOs, agent stubs, job queue, deploy controls.
- `infra/`: VPS deployment (Docker Compose + Caddy HTTPS reverse proxy).

Fastest path to “public HTTPS without buying a domain”:

- Deploy to a VPS with a static public IPv4.
- Use `sslip.io` or `nip.io` with the embedded IP (example: `http://1-2-3-4.sslip.io`), and set that hostname as `DASHBOARD_HOST` for Caddy.

