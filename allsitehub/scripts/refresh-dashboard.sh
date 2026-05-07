#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

if command -v npm >/dev/null 2>&1; then
  npm run update
elif [ -x /usr/local/bin/npm ]; then
  /usr/local/bin/npm run update
elif [ -x /opt/homebrew/bin/npm ]; then
  /opt/homebrew/bin/npm run update
else
  echo "ERROR: npm not found. Install Node.js or ensure npm is on PATH." >&2
  exit 1
fi
