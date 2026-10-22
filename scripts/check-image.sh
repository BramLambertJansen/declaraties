#!/usr/bin/env bash
# Controleert de productie-image (ADR 0049) zonder database: start met APP_ENV=staging en geldige, niet-demo geheimen,
# daarna: niet als root, liveness 200, readiness 503 (geen database), SPA met CSP, API-fout als { code, requestId },
# en na SIGTERM netjes gestopt (exitcode 0). Voor CI en de eigenaar; de agent gebruikt geen docker.
# Gebruik: scripts/check-image.sh <image>
set -euo pipefail

image="${1:?Gebruik: scripts/check-image.sh <image>}"
name="check-image-$$"
port=18080
secret="$(head -c 48 /dev/urandom | base64 | tr -d '\n/+=')"
dbpass="$(head -c 24 /dev/urandom | base64 | tr -d '\n/+=')"

cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

fail() { printf '✗ %s\n' "$1" >&2; docker logs "$name" >&2 || true; exit 1; }

uid="$(docker run --rm --entrypoint id "$image" -u)"
[[ "$uid" != "0" ]] || fail "image draait als root"
echo "✓ niet als root (uid $uid)"

# Postgres-host bestaat niet (.invalid): readiness moet dan 503 geven, het proces mag niet stoppen.
docker run -d --name "$name" -p "127.0.0.1:${port}:8080" \
  -e APP_ENV=staging \
  -e APP_ORIGIN=https://app.example.test \
  -e AUTH_BASE_URL=https://app.example.test \
  -e AUTH_SECRET="$secret" \
  -e DATABASE_URL="postgres://api_user:${dbpass}@db.invalid:5432/app" \
  -e AUTH_DATABASE_URL="postgres://auth_service:${dbpass}x@db.invalid:5432/app" \
  -e SMTP_URL=smtp://mail.invalid:25 \
  -e CLIENT_IP_HEADER=x-forwarded-for \
  "$image" >/dev/null

base="http://127.0.0.1:${port}"
for _ in $(seq 1 30); do
  curl -fsS "$base/api/health" >/dev/null 2>&1 && break
  sleep 1
done

status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

[[ "$(curl -fsS "$base/api/health")" == '{"ok":true}' ]] || fail "GET /api/health geeft geen {\"ok\":true}"
echo "✓ liveness 200"
[[ "$(status "$base/api/ready")" == "503" ]] || fail "GET /api/ready zonder database geeft geen 503"
echo "✓ readiness 503 zonder database"
headers="$(curl -fsS -D - -o /dev/null "$base/admin/accounts")" || fail "GET /admin/accounts faalt"
grep -qi "^content-security-policy: default-src 'self'" <<<"$headers" || fail "SPA zonder CSP"
grep -qi '^cache-control: no-cache' <<<"$headers" || fail "index.html zonder cache-control: no-cache"
echo "✓ SPA met CSP op een schermroute"
index="$(curl -fsS "$base/")" || fail "GET / faalt"
asset="$(grep -o '/assets/[^"]*\.js' <<<"$index" | head -n 1 || true)"
[[ -n "$asset" ]] || fail "index.html verwijst naar geen script in /assets/"
asset_headers="$(curl -fsS -D - -o /dev/null "$base$asset")" || fail "GET $asset faalt"
grep -qi 'immutable' <<<"$asset_headers" || fail "$asset zonder immutable cache"
echo "✓ asset $asset met immutable cache"
body="$(curl -s "$base/api/bestaat-niet")" || fail "GET /api/bestaat-niet faalt"
grep -q '"code":"NOT_FOUND"' <<<"$body" || fail "onbekende API-route geeft geen NOT_FOUND: $body"
echo "✓ API-fout als { code, requestId }"
[[ "$(docker inspect -f '{{.Config.Env}}' "$image")" != *AUTH_SECRET* ]] || fail "AUTH_SECRET in de image"

docker stop -t 15 "$name" >/dev/null
code="$(docker inspect -f '{{.State.ExitCode}}' "$name")"
[[ "$code" == "0" ]] || fail "na SIGTERM exitcode $code in plaats van 0"
echo "✓ na SIGTERM netjes gestopt"
