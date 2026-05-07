# SiteFotos Ops Dashboard

Local dashboard for daily/weekly/monthly SiteFotos landscaping status.

## Public Link (No Domain Needed)

This repo now includes a Render blueprint in `render.yaml` so you can deploy a public URL fast.

### Steps

1. Push this folder to GitHub.
2. In Render, click **New** -> **Blueprint** and select your repo.
3. Render will create:
	- `sitefotos-dashboard` (web service)
	- `sitefotos-dashboard-refresh` (daily cron job)
4. Set environment variables in Render for both services:
	- `SITEFOTOS_API_KEY`
	- `SITEFOTOS_API_BASE_URL` (usually `https://www.sitefotos.com`)
	- `SITEFOTOS_API_BEARER` (`true`)
	- `SITEFOTOS_ACCESS_CODE` (if your account needs it)
5. Open the generated Render URL and share it.

Notes:
- The web service runs `npm run update && npm start` on boot so it has data immediately.
- The cron job runs `npm run update` daily at `13:00 UTC` (adjust schedule in Render if needed).

## Run (manual)

From this folder:

```bash
npm install
npm run dev
```

Then open:

- http://localhost:4545

## Update snapshot (manual)

```bash
npm run update
```

## Daily 8:00 AM auto-refresh (macOS LaunchAgent)

This repo includes a LaunchAgent:

- `launchd/com.sitefotos.dashboard-refresh.plist`

To install + start it (per-user):

```bash
launchctl bootstrap gui/$(id -u) "$(pwd)/launchd/com.sitefotos.dashboard-refresh.plist"
launchctl enable gui/$(id -u)/com.sitefotos.dashboard-refresh
launchctl kickstart -k gui/$(id -u)/com.sitefotos.dashboard-refresh
```

Logs:

- `data/launchd.out.log`
- `data/launchd.err.log`

