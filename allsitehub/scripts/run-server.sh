#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

if command -v node >/dev/null 2>&1; then
  exec node server.js
elif [ -x /usr/local/bin/node ]; then
  exec /usr/local/bin/node server.js
elif [ -x /opt/homebrew/bin/node ]; then
  exec /opt/homebrew/bin/node server.js
else
  echo "ERROR: node not found. Install Node.js or ensure node is on PATH." >&2
  exit 1
fi

