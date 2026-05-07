#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="${SOURCE_DIR:-/Users/kolsondesocio/Desktop/ALLSITE/THE-COMBINE/SITE-FOTOS-DASHBOARD/sitefotos-dashboard}"
DEST_DIR="${DEST_DIR:-/Users/kolsondesocio/SiteFotos/sitefotos-dashboard}"
DATA_DIR="$DEST_DIR/data"
LOG_FILE="$DATA_DIR/deploy.log"
STATUS_FILE="$DATA_DIR/deploy-status.json"

mkdir -p "$DATA_DIR"
: > "$LOG_FILE"

status() {
  /usr/local/bin/node -e 'const fs = require("fs"); const [file, state, message] = process.argv.slice(1); fs.writeFileSync(file, JSON.stringify({ state, message, updatedAt: new Date().toISOString() }, null, 2));' "$STATUS_FILE" "$1" "$2"
}

run() {
  echo
  echo "$ $*"
  "$@"
}

{
  status "running" "Starting deploy"
  echo "Deploy started: $(date)"
  echo "Source: $SOURCE_DIR"
  echo "Destination: $DEST_DIR"

  if [ ! -d "$SOURCE_DIR" ]; then
    status "failed" "Source folder not found"
    echo "ERROR: source folder not found: $SOURCE_DIR"
    exit 1
  fi

  status "running" "Syncing latest code"
  run rsync -a --delete \
    --exclude node_modules \
    --exclude data/deploy.log \
    --exclude data/deploy-status.json \
    --exclude data/public-url.txt \
    --exclude data/localtunnel.log \
    --exclude data/localtunnel.out.log \
    --exclude data/localtunnel.err.log \
    --exclude data/server.out.log \
    --exclude data/server.err.log \
    --exclude data/cloudflared.log \
    --exclude data/cloudflared.out.log \
    --exclude data/cloudflared.err.log \
    --exclude data/launchd.out.log \
    --exclude data/launchd.err.log \
    "$SOURCE_DIR/" "$DEST_DIR/"

  cd "$DEST_DIR"
  chmod +x scripts/*.sh

  status "running" "Installing dependencies"
  run npm install --omit=dev

  status "running" "Refreshing SiteFotos API data"
  run npm run update

  status "running" "Restarting dashboard services"
  run launchctl kickstart -k "gui/$(id -u)/com.sitefotos.dashboard-server"
  run launchctl kickstart -k "gui/$(id -u)/com.sitefotos.dashboard-tunnel"

  status "success" "Deploy complete"
  echo
  echo "Deploy complete: $(date)"
  echo "Public URL: $(cat "$DATA_DIR/public-url.txt" 2>/dev/null || echo "https://allsitefacilities-centralhub.loca.lt")"
} >> "$LOG_FILE" 2>&1 || {
  status "failed" "Deploy failed"
  echo "Deploy failed: $(date)" >> "$LOG_FILE"
  exit 1
}
