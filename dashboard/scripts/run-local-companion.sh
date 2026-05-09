#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ -f "$ROOT/.local-runtime/runtime.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.local-runtime/runtime.env"
  set +a
fi

export DATABASE_URL="${DATABASE_URL:-file:$ROOT/db/dev.db}"
export DASHBOARD_URL="${DASHBOARD_URL:-http://127.0.0.1:3000}"
export AGENT_ID="${AGENT_ID:-kolson-mac}"
export AUTO_APPROVE_CODEX="${AUTO_APPROVE_CODEX:-1}"
export AUTO_APPROVE_AUTOMATIONS="${AUTO_APPROVE_AUTOMATIONS:-1}"
export CODEX_SANDBOX="${CODEX_SANDBOX:-workspace-write}"

exec node companion/agent.mjs
