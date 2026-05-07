#!/usr/bin/env bash
set -euo pipefail

# Deploys the current repo to a VPS over SSH (no GitHub required).
#
# Requirements (on your Mac):
# - ssh + scp
# - this repo checked out locally
#
# Requirements (on VPS):
# - Ubuntu/Debian recommended
# - inbound ports 80/443 open
#
# Usage:
#   VPS_IP=1.2.3.4 bash infra/deploy-vps-from-local.sh
#
# Optional:
#   SSH_USER=root
#   SSH_KEY=secrets/ssh/personalhub_ed25519
#   REMOTE_DIR=/opt/personal-dashboard
#   EMAIL_FOR_TLS=you@example.com

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

VPS_IP="${VPS_IP:-}"
SSH_USER="${SSH_USER:-root}"
SSH_KEY="${SSH_KEY:-$ROOT_DIR/secrets/ssh/personalhub_ed25519}"
REMOTE_DIR="${REMOTE_DIR:-/opt/personal-dashboard}"
EMAIL_FOR_TLS="${EMAIL_FOR_TLS:-you@example.com}"

if [[ -z "$VPS_IP" ]]; then
  echo "ERROR: set VPS_IP (example: VPS_IP=1.2.3.4 bash infra/deploy-vps-from-local.sh)"
  exit 2
fi

if [[ ! -f "$SSH_KEY" ]]; then
  echo "ERROR: SSH key not found at $SSH_KEY"
  exit 2
fi

ARCHIVE="/tmp/personal-dashboard-$(date +%s).tar.gz"
git -C "$ROOT_DIR" archive --format=tar.gz --output="$ARCHIVE" HEAD

echo "Uploading archive to ${SSH_USER}@${VPS_IP}..."
scp -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$ARCHIVE" "${SSH_USER}@${VPS_IP}:/tmp/personal-dashboard.tar.gz"

echo "Bootstrapping VPS + deploying..."
ssh -i "$SSH_KEY" "${SSH_USER}@${VPS_IP}" bash -s <<EOF
set -euo pipefail
export REPO_URL="local"
export APP_DIR="${REMOTE_DIR}"
export EMAIL_FOR_TLS="${EMAIL_FOR_TLS}"

apt-get update -y
apt-get install -y ca-certificates curl git openssl

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

mkdir -p "${REMOTE_DIR}/repo"
tar -xzf /tmp/personal-dashboard.tar.gz -C "${REMOTE_DIR}/repo" --strip-components=0

cd "${REMOTE_DIR}/repo/infra"

PUBLIC_IP="${VPS_IP}"
DASHBOARD_HOST="personal.\${PUBLIC_IP}.nip.io"
ALLSITE_HUB_HOST="allsite.\${PUBLIC_IP}.nip.io"
ALLSITE_CENTRAL_HUB_URL="https://\${ALLSITE_HUB_HOST}"

if [[ ! -f .env ]]; then
  DASHBOARD_PASSWORD="\$(openssl rand -base64 36 | tr -d '\n' | tr '/+' '_-')"
  AGENT_TOKEN="\$(openssl rand -base64 36 | tr -d '\n' | tr '/+' '_-')"
  cat > .env <<ENV
CADDY_EMAIL="${EMAIL_FOR_TLS}"
DASHBOARD_HOST="\${DASHBOARD_HOST}"
ALLSITE_HUB_HOST="\${ALLSITE_HUB_HOST}"
ALLSITE_CENTRAL_HUB_URL="\${ALLSITE_CENTRAL_HUB_URL}"
DASHBOARD_PASSWORD="\${DASHBOARD_PASSWORD}"
AGENT_TOKEN="\${AGENT_TOKEN}"
ENV
fi

docker compose up -d --build

echo ""
echo "Personal dashboard: https://\${DASHBOARD_HOST}"
echo "Allsite hub (placeholder): https://\${ALLSITE_HUB_HOST}"
echo "Secrets: ${REMOTE_DIR}/repo/infra/.env"
EOF

echo "Done."
echo "URLs will be live after Caddy obtains certificates (usually < 1 minute)."

