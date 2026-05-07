#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

exec npx --yes localtunnel --port 4545 --local-host 127.0.0.1 --subdomain allsitefacilities-centralhub 2>&1 | tee "$ROOT_DIR/data/localtunnel.log" | awk '
  /your url is:/ {
    print $NF > "'"$ROOT_DIR"'/data/public-url.txt";
    fflush("'"$ROOT_DIR"'/data/public-url.txt");
  }
  { print; fflush(); }
'
