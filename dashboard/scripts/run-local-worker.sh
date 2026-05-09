#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

if [ -f "$ROOT/.local-runtime/runtime.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.local-runtime/runtime.env"
  set +a
fi

export DATABASE_URL="${DATABASE_URL:-file:$ROOT/db/dev.db}"
export WORKER_ID="${WORKER_ID:-kolson-mac-worker}"

exec node worker/worker.mjs
