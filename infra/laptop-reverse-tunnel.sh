#!/usr/bin/env bash
set -euo pipefail

# Keeps a stable public dashboard URL while running the dashboard + DB locally on your laptop.
#
# This script creates an SSH reverse tunnel:
#   VPS 127.0.0.1:<REMOTE_PORT>  --->  Laptop localhost:<LOCAL_PORT>
#
# Then set on the VPS (in /opt/personal-hub/infra/.env):
#   DASHBOARD_UPSTREAM="host.docker.internal:<REMOTE_PORT>"
#
# Requirements:
# - SSH key access to the VPS
# - (Optional) autossh for reconnects: `brew install autossh`
#
# Usage:
#   VPS_HOST=root@172.239.154.89 bash infra/laptop-reverse-tunnel.sh
#

VPS_HOST="${VPS_HOST:-root@172.239.154.89}"
LOCAL_PORT="${LOCAL_PORT:-3000}"
REMOTE_PORT="${REMOTE_PORT:-7000}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/personalhub_ed25519}"

if command -v autossh >/dev/null 2>&1; then
  exec autossh -M 0 -N \
    -o "ServerAliveInterval=30" -o "ServerAliveCountMax=3" \
    -i "$SSH_KEY" \
    -R "127.0.0.1:${REMOTE_PORT}:localhost:${LOCAL_PORT}" \
    "$VPS_HOST"
fi

exec ssh -N \
  -o "ServerAliveInterval=30" -o "ServerAliveCountMax=3" \
  -i "$SSH_KEY" \
  -R "127.0.0.1:${REMOTE_PORT}:localhost:${LOCAL_PORT}" \
  "$VPS_HOST"

