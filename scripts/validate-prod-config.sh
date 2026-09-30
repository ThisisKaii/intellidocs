#!/usr/bin/env bash
# Validate the production stack without starting it.
#
#   scripts/validate-prod-config.sh
#
# Checks the things that break at deploy time and are easy to miss in review:
# YAML syntax, nginx directive syntax, the upstream names nginx resolves
# against compose service names, and a mismatch between the healthcheck path
# and the routes Express actually registers.

set -euo pipefail

cd "$(dirname "$0")/.."

RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RESET=$'\033[0m'
fail=0

pass() { printf '%s✓%s %s\n' "$GREEN" "$RESET" "$1"; }
warn() { printf '%s!%s %s\n' "$YELLOW" "$RESET" "$1"; }
bad()  { printf '%s✗%s %s\n' "$RED" "$RESET" "$1"; fail=1; }

# ---------------------------------------------------------------------------
# 1. Required files exist
# ---------------------------------------------------------------------------
for f in docker-compose.prod.yml nginx/nginx.conf frontend/dist/index.html; do
  if [ -e "$f" ]; then pass "exists: $f"; else bad "missing: $f"; fi
done

if [ -d nginx/certs ]; then
  if [ -e nginx/certs/fullchain.pem ] && [ -e nginx/certs/privkey.pem ]; then
    pass "TLS certificate and key present"
  else
    warn "nginx/certs exists but fullchain.pem/privkey.pem are missing (manual step)"
  fi
else
  warn "nginx/certs/ absent (manual step: provision the certificate)"
fi

# ---------------------------------------------------------------------------
# 2. Compose file parses and declares the expected services
# ---------------------------------------------------------------------------
if command -v docker >/dev/null 2>&1; then
  if docker compose -f docker-compose.prod.yml config >/dev/null 2>&1; then
    pass "docker compose config is valid"
  else
    bad "docker compose config failed:"
    docker compose -f docker-compose.prod.yml config 2>&1 | sed 's/^/    /' || true
  fi
else
  warn "docker not installed; skipping compose validation"
fi

services() {
  grep -Eo '^  [a-z0-9-]+:' docker-compose.prod.yml | tr -d ' :' | sort -u
}

for svc in nginx server1 server2 ml1 ml2 redis; do
  if services | grep -qx "$svc"; then pass "compose declares service: $svc"; else bad "compose missing service: $svc"; fi
done

# ---------------------------------------------------------------------------
# 3. nginx upstream targets match real compose service names
# ---------------------------------------------------------------------------
if [ -f nginx/nginx.conf ]; then
  # Every `server <name>:<port>` inside an upstream must resolve to a service.
  targets=$(grep -Eo '^\s+server [a-z0-9-]+:[0-9]+' nginx/nginx.conf | awk '{print $2}' | sort -u)
  for t in $targets; do
    name="${t%%:*}"
    if services | grep -qx "$name"; then
      pass "upstream target resolves to a service: $t"
    else
      bad "upstream '$t' has no matching compose service (nginx would fail to start)"
    fi
  done

  # Variables used with hash/map must be defined by a map block. The literal
  # `$` is escaped, otherwise regex treats it as an end-of-line anchor.
  for var in $(grep -Eo 'hash \$[a-z_]+' nginx/nginx.conf | awk '{print $2}' | sort -u); do
    escaped=$(printf '%s' "$var" | sed 's/\$/\\$/')
    if grep -qE "^map .* ${escaped} \{" nginx/nginx.conf; then
      pass "sticky key $var is defined by a map block"
    else
      bad "$var is used in an upstream but never defined (nginx startup error)"
    fi
  done

  # Directive balance: every `server {` needs a matching close.
  opens=$(grep -cE '^\s*server \{' nginx/nginx.conf || true)
  closes=$(grep -cE '^\s*\}' nginx/nginx.conf || true)
  if [ "$opens" -le "$closes" ]; then
    pass "nginx blocks appear balanced ($opens server blocks)"
  else
    warn "nginx block count looks off: $opens opens vs $closes closes"
  fi

  if command -v nginx >/dev/null 2>&1; then
    if nginx -t -c "$PWD/nginx/nginx.conf" 2>&1 | grep -q "syntax is ok"; then
      pass "nginx -t syntax ok"
    else
      bad "nginx -t failed:"
      nginx -t -c "$PWD/nginx/nginx.conf" 2>&1 | sed 's/^/    /' || true
    fi
  else
    warn "nginx binary not installed; skipping 'nginx -t'"
  fi
fi

# ---------------------------------------------------------------------------
# 4. Healthcheck paths match routes Express actually serves
# ---------------------------------------------------------------------------
# The router is mounted at /health, so the route table only holds the suffix.
for route in live ready; do
  if grep -q "'/$route'" server/src/routes/healthRoutes.ts 2>/dev/null; then
    pass "Express registers /health/$route"
  else
    bad "compose healthchecks reference /health/$route but Express does not register it"
  fi
done

if grep -q 'healthCheckPath: /health$' render.yaml 2>/dev/null; then
  if grep -q "router.get('/', liveness)" server/src/routes/healthRoutes.ts 2>/dev/null; then
    pass "render.yaml /health alias is served"
  else
    bad "render.yaml expects GET /health but the alias is missing"
  fi
fi

# ---------------------------------------------------------------------------
# 5. The ML base URL env var the bridge actually reads
# ---------------------------------------------------------------------------
if grep -q 'ML_API_URL' docker-compose.prod.yml; then
  pass "compose sets ML_API_URL (read by pythonBridge)"
else
  bad "compose does not set ML_API_URL; the bridge would fall back to localhost"
fi
# Strip comments before checking for dead env config, so documentation of the
# old variable name does not read as a live setting.
if sed 's/#.*//' docker-compose.prod.yml | grep -q 'ML_SERVICE_URL'; then
  bad "compose sets ML_SERVICE_URL, which pythonBridge never reads"
else
  pass "no dead ML_SERVICE_URL setting in compose"
fi

# ---------------------------------------------------------------------------
# 6. No secrets baked into tracked files
# ---------------------------------------------------------------------------
if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  bad ".env is tracked in git"
else
  pass ".env is not tracked"
fi
if grep -rE 'supabase\.co|password=|-----BEGIN [A-Z ]*PRIVATE KEY' docker-compose.prod.yml nginx/nginx.conf >/dev/null 2>&1; then
  bad "a credential literal appears in the production config"
else
  pass "no credential literals in production config"
fi

printf '\n'
if [ "$fail" -eq 0 ]; then
  printf '%sProduction config validated.%s\n' "$GREEN" "$RESET"
else
  printf '%sProduction config has errors above.%s\n' "$RED" "$RESET"
fi
exit "$fail"
