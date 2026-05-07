#!/usr/bin/env bash
set -euo pipefail

# Lists available /v1/api endpoints from the official SiteFotos OpenAPI JSON.
# This does not use your API key/access code.

tmp="$(mktemp -t sitefotos-openapi.XXXXXX.json)"
trap 'rm -f "$tmp"' EXIT

curl -fsSL "https://www.sitefotos.com/v1/api/referenceJSON" -o "$tmp"

python3 - "$tmp" <<'PY'
import json,sys
path=sys.argv[1]
j=json.load(open(path, "r", encoding="utf-8", errors="ignore"))
paths=sorted((j.get("paths") or {}).keys())
for p in paths:
  print("/v1/api"+p)
PY
