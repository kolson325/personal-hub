#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

CLOUDFLARED="/opt/homebrew/opt/cloudflared/bin/cloudflared"
if [ ! -x "$CLOUDFLARED" ]; then
  CLOUDFLARED="cloudflared"
fi

# Start a Cloudflare Quick Tunnel. URL is logged to stdout; we also persist it to data/public-url.txt.
# Note: quick tunnels are ephemeral; URL changes when the process restarts.
exec "$CLOUDFLARED" tunnel --url http://localhost:4545 --no-autoupdate 2>&1 | tee "$ROOT_DIR/data/cloudflared.log" | awk '
  /https:\/\/[a-z0-9-]+\.trycloudflare\.com/ {
    for (i=1; i<=NF; i++) {
      if ($i ~ /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/) {
        print $i > ("'$ROOT_DIR'/data/public-url.txt");
        fflush(("'$ROOT_DIR'/data/public-url.txt"));
      }
    }
  }
  { print; fflush(); }
'
