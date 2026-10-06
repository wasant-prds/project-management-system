#!/usr/bin/env bash
# Exercises the HTTPS env allowlist and certificate sync without calling certbot.
# Subshells keep stubs from leaking into later cases.
# shellcheck disable=SC2030,SC2031
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=../../infra/certbot/lib/common.sh
source "$ROOT/infra/certbot/lib/common.sh"

fail() {
  echo "FAIL $*" >&2
  exit 1
}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
rm -f "$CERTBOT_DIR/logs/.cf-last-http"
pwned="$tmp/pwned"
{
  printf '%s\n' 'APP_ENV=prod'
  printf '%s\n' 'APP_PORT=3002'
  printf '%s\n' 'APP_ORIGIN=https://pms.example.com'
  printf '%s\n' 'DOMAIN=pms.example.com'
  printf '%s\n' 'EMAIL=owner@example.com'
  printf '%s\n' "CF_API_TOKEN='\$(touch ${pwned})'"
  printf '%s\n' 'CF_ZONE_ID=0123456789abcdef0123456789abcdef'
  printf '%s\n' 'POSTGRES_PASSWORD=not-a-real-secret'
  printf '%s\n' 'OWNER_GATE_PASSWORD=not-a-real-secret'
  printf '%s\n' 'GITLAB_TOKEN=not-a-real-secret'
  printf '%s\n' 'DATABASE_URL=postgresql://user:not-a-real-secret@db/pms'
  printf '%s\n' 'CERTBOT_STAGING=0'
  printf '%s\n' '# comment must be ignored'
  printf '%s\n' 'COMPOSE_FILE=docker-compose.prod.yml'
} >"$tmp/env"

unset POSTGRES_PASSWORD OWNER_GATE_PASSWORD GITLAB_TOKEN DATABASE_URL DOMAIN CERTBOT_STAGING
export PMS_ENV_FILE="$tmp/env"
load_env
apply_defaults

[[ "$DOMAIN" == "pms.example.com" ]] || fail domain
[[ "$APP_ENV" == "prod" ]] || fail app-env
[[ "$APP_PORT" == "3002" ]] || fail port
[[ -z "${POSTGRES_PASSWORD:-}" ]] || fail password
[[ -z "${OWNER_GATE_PASSWORD:-}" ]] || fail owner-password
[[ -z "${GITLAB_TOKEN:-}" ]] || fail gitlab
[[ -z "${DATABASE_URL:-}" ]] || fail database-url
[[ ! -e "$pwned" ]] || fail token-executed
expected="$(printf '%s' "\$(touch ${pwned})")"
[[ "$CF_API_TOKEN" == "$expected" ]] || fail token-literal

(
  unset DOMAIN
  if message="$(apply_defaults 2>&1)"; then
    exit 1
  fi
  printf '%s' "$message" | grep -q 'DOMAIN' || exit 1
  printf '%s' "$message" | grep -q 'ไม่แก้ .env' || exit 1
) || fail missing-domain

(
  cat >"$tmp/quoted.env" <<'EOF'
CF_API_TOKEN="quoted-token-value" # comment must not stay in the token
EOF
  PMS_ENV_FILE="$tmp/quoted.env"
  load_env
  [[ "$CF_API_TOKEN" == "quoted-token-value" ]] || exit 1
) || fail quoted-token-comment

(
  CF_API_TOKEN="cfk_not-an-api-token"
  if message="$(validate_issue_inputs 2>&1)"; then
    exit 1
  fi
  printf '%s' "$message" | grep -q 'Global API Key' || exit 1
) || fail global-key-prefix

(
  CF_API_TOKEN="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  if message="$(validate_issue_inputs 2>&1)"; then
    exit 1
  fi
  printf '%s' "$message" | grep -q 'Global API Key' || exit 1
) || fail global-key-hex

APP_ORIGIN="http://127.0.0.1:3002"
if origin_message="$(origin_ok 2>&1)"; then
  fail origin-accepted
fi
[[ "$origin_message" == *"https://pms.example.com"* ]] || fail origin-expected
[[ "$origin_message" == *"ไม่แก้ .env"* ]] || fail origin-hint
APP_ORIGIN="https://pms.example.com"
origin_ok

APP_ENV="dev"
if validate_common; then
  fail app-env-rejected
fi
APP_ENV="prod"
COMPOSE_FILE="docker-compose.uat.yml"
if validate_common; then
  fail compose-rejected
fi
COMPOSE_FILE="docker-compose.prod.yml"
validate_common

(
  printf '%s\n' 'APP_ENV=prod' 'APP_PORT=3002' 'APP_ORIGIN=https://pms.example.com # owner gate' 'DOMAIN=pms.example.com' 'EMAIL="own#er@example.com"' 'CERTBOT_STAGING=0' >"$tmp/env-comment"
  export PMS_ENV_FILE="$tmp/env-comment"
  load_env
  [[ "$APP_ORIGIN" == "https://pms.example.com" ]] || exit 1
  [[ "$EMAIL" == "own#er@example.com" ]] || exit 1
) || fail inline-comment

(
  export CERTBOT_STAGING=1
  export PMS_ENV_FILE="$tmp/env"
  load_env
  apply_defaults
  [[ "$CERTBOT_STAGING" == "1" ]] || exit 1
  [[ "$CERT_NAME" == "pms.example.com-staging" ]] || exit 1
) || fail staging

CERTBOT_CONF="$tmp/conf"
NGINX_CERTS="$tmp/certs"
mkdir -p "$CERTBOT_CONF/live/$CERT_NAME" "$NGINX_CERTS"
printf 'a\n' >"$CERTBOT_CONF/live/$CERT_NAME/fullchain.pem"
printf 'b\n' >"$CERTBOT_CONF/live/$CERT_NAME/privkey.pem"
touch -d '2020-01-01 00:00:00' "$CERTBOT_CONF/live/$CERT_NAME/fullchain.pem"
reloads=0
reload_nginx() {
  reloads=$((reloads + 1))
}
sync_certificate
[[ "$reloads" == "1" ]] || fail sync-first
sync_certificate
[[ "$reloads" == "1" ]] || fail sync-repeat
touch -d '2020-01-02 00:00:00' "$CERTBOT_CONF/live/$CERT_NAME/fullchain.pem"
sync_certificate
[[ "$reloads" == "2" ]] || fail sync-renewed

(
  id() { printf '%s\n' 1000; }
  message="$(require_root 2>&1 || true)"
  printf '%s' "$message" | grep -q 'sudo' || exit 1
) || fail require-root

(
  cf_calls="$tmp/cf-flex"
  : >"$cf_calls"
  cf_request() {
    printf '%s %s\n' "$1" "${3:-}" >>"$cf_calls"
    printf '%s\n' '{ "success": true, "result": { "id": "ssl", "value": "flexible" } }'
  }
  relax_ssl_for_issuance
  [[ "$ORIGINAL_SSL_MODE" == "flexible" ]] || exit 1
  [[ "$CF_MODE_CHANGED" == "0" ]] || exit 1
  if grep -q 'PATCH' "$cf_calls"; then exit 1; fi
) || fail keep-flexible

(
  cf_calls="$tmp/cf-strict"
  : >"$cf_calls"
  cf_request() {
    printf '%s %s\n' "$1" "${3:-}" >>"$cf_calls"
    if [[ "$1" == "GET" ]]; then
      printf '%s\n' '{ "success": true, "result": { "id": "ssl", "value": "strict" } }'
    else
      printf '%s\n' '{"success":true}'
    fi
  }
  relax_ssl_for_issuance
  [[ "$CF_MODE_CHANGED" == "1" ]] || exit 1
  [[ "$ORIGINAL_SSL_MODE" == "strict" ]] || exit 1
  grep -F -q 'PATCH {"value":"full"}' "$cf_calls" || exit 1
  restore_original_ssl_mode
  [[ "$CF_MODE_CHANGED" == "0" ]] || exit 1
  grep -F -q 'PATCH {"value":"strict"}' "$cf_calls" || exit 1
) || fail restore-strict

(
  cf_request() {
    if [[ "$2" == *'/user/tokens/verify'* ]]; then
      printf '%s\n' '{"success":true,"result":{"status":"active"}}'
      return 0
    fi
    printf '%s\n' '{"success":false,"errors":[{"code":9109,"message":"Unauthorized to access zone"}],"messages":[],"result":null}'
  }
  CF_API_TOKEN="synthetic-token-value"
  if message="$(assert_proxied_dns 2>&1)"; then
    exit 1
  fi
  printf '%s' "$message" | grep -q '9109' || exit 1
  printf '%s' "$message" | grep -q 'Zone DNS Read' || exit 1
  if printf '%s' "$message" | grep -q 'synthetic-token-value'; then
    exit 1
  fi
) || fail dns-api-error

(
  cf_request() {
    printf '%s\n' '{"success":false,"errors":[{"code":10000,"message":"Authentication error"}]}'
  }
  if message="$(assert_proxied_dns 2>&1)"; then
    exit 1
  fi
  printf '%s' "$message" | grep -q '10000' || exit 1
  printf '%s' "$message" | grep -q 'CF_API_TOKEN' || exit 1
) || fail token-verify

(
  cf_calls="$tmp/cf-rule"
  : >"$cf_calls"
  cf_request() {
    printf '%s %s\n' "$1" "$2" >>"$cf_calls"
    if [[ "$1" == "GET" ]]; then
      printf '%s\n' '{"success":true,"result":{"rules":[{"description":"keep-me"}]}}'
    else
      printf '%s\n' '{"success":false}'
    fi
  }
  docker() { cat; }
  if ensure_hostname_strict_rule; then exit 1; fi
  grep -q 'rulesets/phases/http_config_settings/entrypoint' "$cf_calls" || exit 1
  if grep -q '/settings/ssl' "$cf_calls"; then exit 1; fi
) || fail hostname-rule-no-zone-change

(
  cf_calls="$tmp/cf-rule-guard"
  : >"$cf_calls"
  cf_request() {
    printf '%s %s\n' "$1" "$2" >>"$cf_calls"
    printf '%s\n' '{"success":false,"errors":[{"message":"rules unavailable"}],"result":{"rules":[{"description":"keep-me"}]}}'
  }
  docker() { cat; }
  if ensure_hostname_strict_rule; then exit 1; fi
  if grep -q '^PUT ' "$cf_calls"; then exit 1; fi
) || fail ruleset-no-overwrite

(
  cf_calls="$tmp/cf-remove-guard"
  : >"$cf_calls"
  cf_request() {
    printf '%s %s\n' "$1" "$2" >>"$cf_calls"
    printf '%s\n' '{"success":false,"result":{"rules":[{"description":"keep-me"}]}}'
  }
  if remove_hostname_strict_rule; then exit 1; fi
  if grep -q '^PUT ' "$cf_calls"; then exit 1; fi
) || fail remove-no-guess

(
  cf_calls="$tmp/cf-create"
  : >"$cf_calls"
  cf_request() {
    printf '%s %s\n' "$1" "$2" >>"$cf_calls"
    if [[ "$1" == "GET" ]]; then
      printf '%s\n' '{"success":false,"errors":[{"message":"could not find entrypoint"}]}'
    else
      printf '%s\n' '{"success":true}'
    fi
  }
  docker() { printf '%s' '{"rules":[{"description":"pms-https-origin-strict"}]}'; }
  ensure_hostname_strict_rule
  grep -q '^PUT ' "$cf_calls" || exit 1
) || fail ruleset-create

(
  CERTBOT_CONF="$tmp/renew-conf"
  CERTBOT_WWW="$tmp/renew-www"
  mkdir -p "$CERTBOT_CONF" "$CERTBOT_WWW"
  CERT_NAME="pms.example.com"
  docker() { printf '%s\n' "$*" >"$tmp/docker-renew"; }
  run_certbot_renew
  grep -q 'renew' "$tmp/docker-renew" || exit 1
  grep -F -q -- '--cert-name pms.example.com' "$tmp/docker-renew" || exit 1
) || fail renew-cert-name

(
  mkdir -p "$CERTBOT_CONF/renewal"
  printf 'x\n' >"$CERTBOT_CONF/renewal/pms.example.com-staging.conf"
  docker() { printf '%s\n' "$*" >"$tmp/docker-delete"; }
  delete_staging_lineage
  grep -q 'delete' "$tmp/docker-delete" || exit 1
  grep -F -q -- '--cert-name pms.example.com-staging' "$tmp/docker-delete" || exit 1
) || fail delete-staging

(
  CERTBOT_STAGING=1
  if refuse_staging_over_production; then
    exit 1
  fi
) || fail staging-over-production

(
  CERTBOT_CONF="$tmp/empty-conf"
  mkdir -p "$CERTBOT_CONF"
  CERTBOT_STAGING=1
  refuse_staging_over_production
) || fail staging-without-production

(
  docker() {
    printf '%s\n' 'other-proxy 0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp'
  }
  if assert_ports_available; then exit 1; fi
) || fail port-other

(
  docker() {
    printf '%s\n' 'pms-nginx-prod 0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp'
  }
  assert_ports_available
) || fail port-owned

(
  timedatectl() { printf '%s\n' 'Asia/Bangkok'; }
  export CRON_DEST="$tmp/pms-https"
  install_cron
  grep -F -q '15 3,15 * * * root' "$CRON_DEST" || exit 1
  grep -F -q 'setup-https.sh' "$CRON_DEST" || exit 1
  grep -F -q 'renew' "$CRON_DEST" || exit 1
  if grep -q 'CRON_TZ' "$CRON_DEST"; then exit 1; fi
) || fail cron-bangkok

(
  timedatectl() { printf '%s\n' 'UTC'; }
  export CRON_DEST="$tmp/pms-https-utc"
  if install_cron; then exit 1; fi
  [[ ! -e "$CRON_DEST" ]] || exit 1
) || fail cron-utc

(
  curl() {
    if [[ "$*" == *ips-v4 ]]; then
      printf '%s\n' '1.2.3.0/24'
    else
      printf '%s\n' '2001:db8::/32'
    fi
  }
  nginx_config_test() { return 0; }
  NGINX_DIR="$tmp/nginx-dir"
  mkdir -p "$NGINX_DIR"
  printf '%s\n' 'set_real_ip_from 10.0.0.0/8;' >"$NGINX_DIR/cloudflare-real-ip.conf"
  refresh_cloudflare_ips
  grep -F -q "geo \$realip_remote_addr \$pms_cloudflare_client" "$NGINX_DIR/cloudflare-real-ip.conf" || exit 1
  grep -F -q '1.2.3.0/24 1;' "$NGINX_DIR/cloudflare-real-ip.conf" || exit 1
  grep -F -q 'set_real_ip_from 1.2.3.0/24;' "$NGINX_DIR/cloudflare-real-ip.conf" || exit 1
  if grep -Eq '^[[:space:]]*(allow|deny)[[:space:]]' "$NGINX_DIR/cloudflare-real-ip.conf"; then exit 1; fi
) || fail refresh-geo

(
  curl() { return 1; }
  NGINX_DIR="$tmp/nginx-dir2"
  mkdir -p "$NGINX_DIR"
  printf '%s\n' 'original-marker' >"$NGINX_DIR/cloudflare-real-ip.conf"
  refresh_cloudflare_ips
  grep -F -q 'original-marker' "$NGINX_DIR/cloudflare-real-ip.conf" || exit 1
) || fail refresh-keeps-original

if command -v python3 >/dev/null 2>&1; then
  py=(python3)
elif command -v python >/dev/null 2>&1; then
  py=(python)
elif command -v py >/dev/null 2>&1; then
  py=(py -3)
else
  fail python-missing
fi
sample='{"success":true,"result":{"rules":[{"id":"abc","description":"keep-me","expression":"true","action":"set_config","action_parameters":{"ssl":"full"},"enabled":true},{"id":"old","description":"pms-https-origin-strict","expression":"(http.host eq \"old.example\")","action":"set_config","action_parameters":{"ssl":"full"}}]}}'
out="$(printf '%s' "$sample" | PMS_DOMAIN=pms.example.com PMS_RULE_DESCRIPTION=pms-https-origin-strict PMS_RULE_ACTION=upsert "${py[@]}" "$ROOT/infra/certbot/lib/merge-hostname-rule.py")"
printf '%s' "$out" | grep -F -q 'keep-me' || fail merge-keep
printf '%s' "$out" | grep -F -q 'pms.example.com' || fail merge-host
printf '%s' "$out" | grep -E -q '"ssl": "strict"|"ssl":"strict"' || fail merge-strict
printf '%s' "$out" | grep -F -q 'pms-https-origin-strict' || fail merge-present
case "$out" in
  *pms-https-origin-strict*keep-me*) ;;
  *) fail merge-order ;;
esac
if printf '%s' "$out" | grep -F -q 'old.example'; then fail merge-replaced; fi
count="$(printf '%s' "$out" | grep -o 'pms-https-origin-strict' | wc -l | tr -d '[:space:]')"
[[ "$count" == "1" ]] || fail merge-duplicate
removed="$(printf '%s' "$sample" | PMS_DOMAIN=pms.example.com PMS_RULE_DESCRIPTION=pms-https-origin-strict PMS_RULE_ACTION=remove "${py[@]}" "$ROOT/infra/certbot/lib/merge-hostname-rule.py")"
if printf '%s' "$removed" | grep -F -q 'pms-https-origin-strict'; then fail merge-remove; fi
printf '%s' "$removed" | grep -F -q 'keep-me' || fail merge-remove-keep
printf '%s' "$removed" | grep -E -q '"id": "abc"|"id":"abc"' || fail merge-remove-id
if printf '%s' '{"success":true,"result":{}}' | PMS_DOMAIN=pms.example.com PMS_RULE_DESCRIPTION=pms-https-origin-strict PMS_RULE_ACTION=upsert "${py[@]}" "$ROOT/infra/certbot/lib/merge-hostname-rule.py" >/dev/null; then
  fail merge-missing-rules
fi

command -v curl >/dev/null 2>&1 || fail curl-missing
cat >"$tmp/cf-listen.py" <<'PY'
import json
import socket
import sys

port_path = sys.argv[1]
server = socket.socket()
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
server.bind(("127.0.0.1", 0))
server.listen(1)
with open(port_path, "w", encoding="utf-8") as handle:
    handle.write(str(server.getsockname()[1]))
server.settimeout(10)
conn, _addr = server.accept()
data = b""
while b"\r\n\r\n" not in data:
    chunk = conn.recv(4096)
    if not chunk:
        break
    data += chunk
headers = data.split(b"\r\n\r\n", 1)[0].decode("latin1")
authorization = ""
content_type = ""
for line in headers.split("\r\n"):
    if line.lower().startswith("authorization:"):
        authorization = line.split(":", 1)[1].strip()
    if line.lower().startswith("content-type:"):
        content_type = line.split(":", 1)[1].strip()
body = json.dumps({"authorization": authorization, "contentType": content_type}).encode()
response = (
    b"HTTP/1.1 200 OK\r\n"
    b"Content-Type: application/json\r\n"
    b"Content-Length: " + str(len(body)).encode() + b"\r\n"
    b"Connection: close\r\n\r\n" + body
)
conn.sendall(response)
conn.shutdown(socket.SHUT_WR)
conn.close()
server.close()
PY
"${py[@]}" "$tmp/cf-listen.py" "$tmp/cf-port" &
listener=$!
ready=0
for _attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  if [[ -s "$tmp/cf-port" ]]; then
    ready=1
    break
  fi
  sleep 0.1
done
if [[ "$ready" != "1" ]]; then
  kill "$listener" 2>/dev/null || true
  fail cf-listener
fi
port="$(tr -cd '0-9' <"$tmp/cf-port")"
CF_API_TOKEN="synthetic-token_value-123"
header_body="$(cf_request GET "http://127.0.0.1:${port}/dns")" || fail cf-authorization-header
wait "$listener" || true
printf '%s' "$header_body" | grep -F -q 'Bearer synthetic-token_value-123' || fail cf-authorization-header
printf '%s' "$header_body" | grep -F -q 'application/json' || fail cf-content-type
grep -q '^200$' "$CERTBOT_DIR/logs/.cf-last-http" || fail cf-http-status
rm -f "$CERTBOT_DIR/logs/.cf-last-http"

echo OK
