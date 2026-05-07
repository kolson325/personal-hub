#!/usr/bin/env bash
set -euo pipefail

# Bootstraps an Ubuntu/Debian VPS to run the dashboard stack with HTTPS using nip.io/sslip.io hostnames.
#
# Usage (run on the VPS as root):
#   curl -fsSL <RAW_URL_TO_THIS_FILE> | bash
#
# Or copy this file to the VPS and run:
#   bash ./vps-bootstrap.sh

APP_DIR="${APP_DIR:-/opt/personal-dashboard}"
REPO_URL="${REPO_URL:-}"
BRANCH="${BRANCH:-main}"
EMAIL_FOR_TLS="${EMAIL_FOR_TLS:-you@example.com}"

if [[ -z "$REPO_URL" ]]; then
  echo "ERROR: Set REPO_URL to your GitHub repo URL (HTTPS)."
  echo "Example: REPO_URL=https://github.com/<you>/<repo>.git bash ./vps-bootstrap.sh"
  exit 2
fi

apt-get update -y
apt-get install -y ca-certificates curl git openssl

# Install Docker Engine (official convenience script)
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

mkdir -p "$APP_DIR"
cd "$APP_DIR"

if [[ ! -d repo/.git ]]; then
  git clone --branch "$BRANCH" "$REPO_URL" repo
fi

cd repo/infra

PUBLIC_IP="$(curl -fsSL https://ifconfig.me || true)"
if [[ -z "$PUBLIC_IP" ]]; then
  echo "ERROR: Could not determine public IP (ifconfig.me). Set PUBLIC_IP manually."
  exit 2
fi

# Fast no-domain hostnames via nip.io (sslip.io also works)
DASHBOARD_HOST="${DASHBOARD_HOST:-personal.${PUBLIC_IP}.nip.io}"
ALLSITE_HUB_HOST="${ALLSITE_HUB_HOST:-allsite.${PUBLIC_IP}.nip.io}"
ALLSITE_CENTRAL_HUB_URL="${ALLSITE_CENTRAL_HUB_URL:-https://${ALLSITE_HUB_HOST}}"

if [[ ! -f .env ]]; then
  DASHBOARD_PASSWORD="$(openssl rand -base64 36 | tr -d '\n' | tr '/+' '_-')"
  AGENT_TOKEN="$(openssl rand -base64 36 | tr -d '\n' | tr '/+' '_-')"

  cat > .env <<EOF
CADDY_EMAIL="${EMAIL_FOR_TLS}"
DASHBOARD_HOST="${DASHBOARD_HOST}"
ALLSITE_HUB_HOST="${ALLSITE_HUB_HOST}"
ALLSITE_CENTRAL_HUB_URL="${ALLSITE_CENTRAL_HUB_URL}"
DASHBOARD_PASSWORD="${DASHBOARD_PASSWORD}"
AGENT_TOKEN="${AGENT_TOKEN}"
EOF
fi

docker compose up -d --build

echo ""
echo "Deployed."
echo "Personal dashboard: https://${DASHBOARD_HOST}"
echo "Allsite hub (placeholder): https://${ALLSITE_HUB_HOST}"
echo ""
echo "Secrets saved in: ${APP_DIR}/repo/infra/.env"
echo "Open ports required: 80 and 443"
