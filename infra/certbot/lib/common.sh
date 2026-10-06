#!/usr/bin/env bash
# Shared helpers for the production HTTPS setup script.
# Reads only an allowlisted set of keys from the root .env. Other secrets in
# that file are never exported and must not be logged.

set -euo pipefail

_COMMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERTBOT_DIR="$(cd "$_COMMON_DIR/.." && pwd)"
ROOT="$(cd "$CERTBOT_DIR/../.." && pwd)"
NGINX_DIR="$ROOT/infra/nginx"
CERTBOT_CONF="$CERTBOT_DIR/conf"
CERTBOT_WWW="$CERTBOT_DIR/www"
NGINX_CERTS="$NGINX_DIR/certs"

DEFAULT_NGINX_IMAGE="nginx:1.28-alpine"
DEFAULT_CERTBOT_IMAGE="certbot/certbot:v5.8.0"
DEFAULT_OPENSSL_IMAGE="alpine/openssl:latest"
HOSTNAME_RULE_DESCRIPTION="pms-https-origin-strict"
CF_MODE_CHANGED=0
ORIGINAL_SSL_MODE=""

log() {
  printf '[%s] %s\n' "$(TZ=Asia/Bangkok date '+%Y-%m-%d %H:%M:%S %z')" "$*"
}

load_env() {
  local env_file="${PMS_ENV_FILE:-$ROOT/.env}"
  local ambient_staging="${CERTBOT_STAGING-}"
  local line key value quoted

  unset DOMAIN EMAIL CF_API_TOKEN CF_ZONE_ID APP_ORIGIN APP_ENV APP_PORT \
    CERTBOT_STAGING CERTBOT_IMAGE NGINX_SERVICE COMPOSE_FILE NGINX_IMAGE OPENSSL_IMAGE

  if [[ ! -f "$env_file" ]]; then
    echo "ไม่พบไฟล์ environment: ${env_file}" >&2
    exit 1
  fi

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    line="${line#"${line%%[![:space:]]*}"}"
    if [[ -z "$line" || "$line" == '#'* || "$line" != *=* ]]; then
      continue
    fi

    key="${line%%=*}"
    key="${key#export }"
    key="${key%"${key##*[![:space:]]}"}"
    case "$key" in
      DOMAIN | EMAIL | CF_API_TOKEN | CF_ZONE_ID | APP_ORIGIN | APP_ENV | APP_PORT | CERTBOT_STAGING | CERTBOT_IMAGE | NGINX_SERVICE | COMPOSE_FILE | NGINX_IMAGE | OPENSSL_IMAGE) ;;
      *) continue ;;
    esac

    value="${line#*=}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    value="${value%$'\r'}"
    quoted=0
    if [[ ${#value} -ge 2 ]]; then
      if [[ ${value:0:1} == '"' && ${value: -1} == '"' ]] || [[ ${value:0:1} == "'" && ${value: -1} == "'" ]]; then
        value="${value:1:${#value}-2}"
        quoted=1
      fi
    fi
    if [[ "$quoted" -eq 0 ]]; then
      value="${value%%[[:space:]]#*}"
      value="${value%"${value##*[![:space:]]}"}"
      if [[ ${#value} -ge 2 ]]; then
        if [[ ${value:0:1} == '"' && ${value: -1} == '"' ]] || [[ ${value:0:1} == "'" && ${value: -1} == "'" ]]; then
          value="${value:1:${#value}-2}"
        fi
      fi
    fi

    case "$key" in
      DOMAIN) DOMAIN="$value" ;;
      EMAIL) EMAIL="$value" ;;
      CF_API_TOKEN) CF_API_TOKEN="$value" ;;
      CF_ZONE_ID) CF_ZONE_ID="$value" ;;
      APP_ORIGIN) APP_ORIGIN="$value" ;;
      APP_ENV) APP_ENV="$value" ;;
      APP_PORT) APP_PORT="$value" ;;
      CERTBOT_STAGING) CERTBOT_STAGING="$value" ;;
      CERTBOT_IMAGE) CERTBOT_IMAGE="$value" ;;
      NGINX_SERVICE) NGINX_SERVICE="$value" ;;
      COMPOSE_FILE) COMPOSE_FILE="$value" ;;
      NGINX_IMAGE) NGINX_IMAGE="$value" ;;
      OPENSSL_IMAGE) OPENSSL_IMAGE="$value" ;;
    esac
    export "${key?}"
  done <"$env_file"

  if [[ -n "$ambient_staging" ]]; then
    CERTBOT_STAGING="$ambient_staging"
    export CERTBOT_STAGING
  fi
}

apply_defaults() {
  NGINX_SERVICE="${NGINX_SERVICE:-nginx}"
  COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
  CERTBOT_IMAGE="${CERTBOT_IMAGE:-$DEFAULT_CERTBOT_IMAGE}"
  OPENSSL_IMAGE="${OPENSSL_IMAGE:-$DEFAULT_OPENSSL_IMAGE}"
  NGINX_IMAGE="${NGINX_IMAGE:-$DEFAULT_NGINX_IMAGE}"
  CERTBOT_STAGING="${CERTBOT_STAGING:-0}"
  APP_PORT="${APP_PORT:-3000}"
  if [[ -z "${DOMAIN:-}" ]]; then
    echo "ต้องตั้ง DOMAIN ใน root .env เป็นชื่อโดเมนตัวพิมพ์เล็ก เช่น pms.example.com" >&2
    echo "สคริปต์นี้ไม่แก้ .env — ตั้ง DOMAIN, EMAIL, CF_ZONE_ID, CF_API_TOKEN และ APP_ORIGIN=https://<DOMAIN> ก่อนรันใหม่" >&2
    exit 1
  fi
  CERT_NAME="$DOMAIN"
  if [[ "$CERTBOT_STAGING" == "1" ]]; then
    CERT_NAME="${DOMAIN}-staging"
  fi
  export NGINX_SERVICE COMPOSE_FILE CERTBOT_IMAGE OPENSSL_IMAGE NGINX_IMAGE CERTBOT_STAGING APP_PORT CERT_NAME
}

require_cmd() {
  local name
  for name in "$@"; do
    if ! command -v "$name" >/dev/null 2>&1; then
      echo "ไม่พบคำสั่ง ${name}" >&2
      exit 1
    fi
  done
}

require_root() {
  if [[ "$(id -u)" -eq 0 ]]; then
    return 0
  fi
  echo "สคริปต์นี้ต้องรันด้วย root เพราะ certbot เขียนไฟล์เป็น root" >&2
  echo "ใช้: sudo bash infra/certbot/setup-https.sh" >&2
  return 1
}

validate_common() {
  if [[ ! "${DOMAIN:-}" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$ ]]; then
    echo "DOMAIN ต้องเป็นชื่อโดเมนตัวพิมพ์เล็ก เช่น pms.example.com" >&2
    return 1
  fi
  if [[ "${APP_ENV:-}" != "prod" ]]; then
    echo "สคริปต์นี้ใช้กับ APP_ENV=prod เท่านั้น" >&2
    return 1
  fi
  if [[ "$COMPOSE_FILE" != "docker-compose.prod.yml" ]]; then
    echo "COMPOSE_FILE ต้องเป็น docker-compose.prod.yml" >&2
    return 1
  fi
  if [[ ! "${APP_PORT:-}" =~ ^[0-9]+$ ]] || [[ "$APP_PORT" -lt 1 || "$APP_PORT" -gt 65535 ]]; then
    echo "APP_PORT ไม่ถูกต้อง" >&2
    return 1
  fi
  case "$CERTBOT_STAGING" in
    0 | 1) ;;
    *)
      echo "CERTBOT_STAGING ต้องเป็น 0 หรือ 1" >&2
      return 1
      ;;
  esac
  origin_ok
}

origin_ok() {
  local expected="https://${DOMAIN}"
  if [[ "${APP_ORIGIN:-}" == "$expected" ]]; then
    return 0
  fi
  echo "APP_ORIGIN ต้องเป็น ${expected} ตรงตัว (scheme และ host ห้ามใส่พอร์ต 443)" >&2
  echo "ค่าปัจจุบันคือ ${APP_ORIGIN:-<ว่าง>}" >&2
  echo "สคริปต์นี้ไม่แก้ .env — แก้ root .env แล้ว recreate app container ก่อนรันใหม่" >&2
  return 1
}

validate_issue_inputs() {
  if [[ ! "${EMAIL:-}" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
    echo "EMAIL ไม่ใช่ที่อยู่ที่ใช้สมัคร Let's Encrypt ได้" >&2
    return 1
  fi
  if [[ -z "${CF_API_TOKEN:-}" || "$CF_API_TOKEN" == *$'\n'* || "$CF_API_TOKEN" =~ [[:space:]] ]]; then
    echo "CF_API_TOKEN ว่างหรือมีช่องว่าง" >&2
    return 1
  fi
  if [[ "$CF_API_TOKEN" == *\"* || "$CF_API_TOKEN" == *\'* ]]; then
    echo "CF_API_TOKEN มีเครื่องหมายคำพูดปนอยู่ ใส่ค่าล้วนทั้งบรรทัด หรือใส่ quote ครอบทั้งค่าโดยไม่มีคอมเมนต์ท้ายบรรทัด" >&2
    return 1
  fi
  if [[ "$CF_API_TOKEN" == cfk_* || "$CF_API_TOKEN" =~ ^[a-f0-9]{37,45}$ ]]; then
    echo "CF_API_TOKEN เป็น Global API Key สคริปต์นี้ใช้ API Token แบบ Bearer เท่านั้น" >&2
    echo "สร้าง API Token ที่มีสิทธิ์ Zone DNS Read, Zone Settings Edit และ Config Rules Edit บน zone นี้ แล้วแทนค่าเดิม" >&2
    return 1
  fi
  if [[ ! "${CF_ZONE_ID:-}" =~ ^[a-f0-9]{32}$ ]]; then
    echo "CF_ZONE_ID ต้องเป็นตัวเลขฐานสิบหก 32 ตัว" >&2
    return 1
  fi
}

cf_request() {
  local method="$1"
  local url="$2"
  local data="${3:-}"
  local response_file header_file http_code
  local -a curl_args
  response_file="$(mktemp)"
  header_file="$(mktemp)"
  chmod 600 "$header_file" "$response_file"
  printf 'Authorization: Bearer %s\n' "$CF_API_TOKEN" >"$header_file"
  printf 'Content-Type: application/json\n' >>"$header_file"
  # -q ignores ~/.curlrc. -H @file sends the raw header so the token stays out of argv.
  curl_args=(-q -sS --max-time 30 -H "@${header_file}" -X "$method" -o "$response_file" -w '%{http_code}')
  if [[ -n "$data" ]]; then
    curl_args+=(--data "$data")
  fi
  if ! http_code="$(curl "${curl_args[@]}" "$url")"; then
    rm -f "$response_file" "$header_file"
    echo "เรียก Cloudflare API ไม่สำเร็จ" >&2
    return 1
  fi
  rm -f "$header_file"
  mkdir -p "$CERTBOT_DIR/logs"
  printf '%s\n' "$http_code" >"$CERTBOT_DIR/logs/.cf-last-http"
  chmod 600 "$CERTBOT_DIR/logs/.cf-last-http"
  cat "$response_file"
  rm -f "$response_file"
}

cf_ok() {
  grep -Eq '"success"[[:space:]]*:[[:space:]]*true' <<<"${1-}"
}

cf_explain() {
  local body="$1"
  local code="" msg="" status=""
  code="$(printf '%s\n' "$body" | grep -Eo '"code"[[:space:]]*:[[:space:]]*[0-9]+' | head -n 1 | grep -Eo '[0-9]+' | head -n 1 || true)"
  msg="$(printf '%s\n' "$body" | grep -Eo '"message"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n 1 | sed -n 's/.*"\([^"]*\)"$/\1/p' || true)"
  if [[ -f "$CERTBOT_DIR/logs/.cf-last-http" ]]; then
    status="$(tr -cd '0-9' <"$CERTBOT_DIR/logs/.cf-last-http")"
  fi
  if [[ -n "${CF_API_TOKEN:-}" && -n "$msg" && "$msg" == *"$CF_API_TOKEN"* ]]; then
    msg="${msg//"$CF_API_TOKEN"/[redacted]}"
  fi
  if [[ ${#msg} -gt 180 ]]; then
    msg="${msg:0:180}"
  fi
  if [[ -n "$code" || -n "$msg" || -n "$status" ]]; then
    echo "Cloudflare ตอบ HTTP ${status:-ไม่ทราบ} รหัส ${code:-ไม่ทราบ}: ${msg:-ไม่มีข้อความ}" >&2
  fi
  if [[ "$code" == "9106" ]]; then
    echo "Cloudflare ไม่ได้รับหัว Authorization" >&2
  fi
}

cf_set_ssl_mode() {
  local mode="$1"
  local resp
  case "$mode" in
    off | flexible | full | strict) ;;
    *)
      echo "SSL mode ไม่ถูกต้อง" >&2
      return 1
      ;;
  esac
  resp="$(cf_request PATCH "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/settings/ssl" "{\"value\":\"${mode}\"}")" || return 1
  if ! cf_ok "$resp"; then
    echo "ตั้ง Cloudflare SSL mode เป็น ${mode} ไม่สำเร็จ" >&2
    cf_explain "$resp"
    return 1
  fi
  log "Cloudflare SSL mode = ${mode}"
}

parse_ssl_mode() {
  printf '%s\n' "$1" | sed -n 's/.*"value"[[:space:]]*:[[:space:]]*"\([a-z]*\)".*/\1/p' | head -n 1
}

cf_get_ssl_mode() {
  local resp mode
  resp="$(cf_request GET "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/settings/ssl")" || return 1
  if ! cf_ok "$resp"; then
    echo "อ่าน Cloudflare SSL mode ไม่สำเร็จ" >&2
    return 1
  fi
  mode="$(parse_ssl_mode "$resp")"
  case "$mode" in
    off | flexible | full | strict)
      printf '%s\n' "$mode"
      ;;
    *)
      echo "ค่า SSL mode ไม่รองรับ" >&2
      return 1
      ;;
  esac
}

relax_ssl_for_issuance() {
  local mode
  mode="$(cf_get_ssl_mode)" || return 1
  ORIGINAL_SSL_MODE="$mode"
  if [[ "$mode" == "strict" ]]; then
    log "zone SSL mode เป็น strict จะสลับเป็น full ชั่วคราวระหว่างยืนยันโดเมน"
    cf_set_ssl_mode full || return 1
    CF_MODE_CHANGED=1
  else
    log "คง zone SSL mode ไว้ที่ ${mode}"
  fi
}

restore_original_ssl_mode() {
  if [[ "${CF_MODE_CHANGED:-0}" != "1" ]]; then
    return 0
  fi
  if [[ -z "${ORIGINAL_SSL_MODE:-}" ]]; then
    echo "ไม่ทราบ SSL mode เดิม จึงไม่เปลี่ยนค่าใน zone" >&2
    return 0
  fi
  log "คืน zone SSL mode เป็น ${ORIGINAL_SSL_MODE}"
  if cf_set_ssl_mode "$ORIGINAL_SSL_MODE"; then
    CF_MODE_CHANGED=0
  fi
}

ruleset_url() {
  printf '%s\n' "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/rulesets/phases/http_config_settings/entrypoint"
}

merge_hostname_rule_body() {
  local action="$1"
  local source="$2"
  printf '%s' "$source" | docker run --rm -i --entrypoint python \
    -e "PMS_DOMAIN=${DOMAIN}" \
    -e "PMS_RULE_DESCRIPTION=${HOSTNAME_RULE_DESCRIPTION}" \
    -e "PMS_RULE_ACTION=${action}" \
    -v "$ROOT/infra/certbot/lib/merge-hostname-rule.py:/merge-hostname-rule.py:ro" \
    "$CERTBOT_IMAGE" /merge-hostname-rule.py
}

apply_hostname_rule() {
  local action="$1"
  local current body resp url
  url="$(ruleset_url)"
  current="$(cf_request GET "$url")" || return 1
  if ! cf_ok "$current"; then
    if grep -q '"rules"' <<<"$current"; then
      echo "อ่าน Cloudflare ruleset ไม่สำเร็จ จึงไม่เขียนทับกฎเดิม ตรวจสิทธิ์ Config Rules Edit" >&2
      return 1
    fi
    if [[ "$action" == "remove" ]]; then
      log "ไม่พบ ruleset ที่จะเอา hostname rule ออก"
      return 0
    fi
  fi
  body="$(merge_hostname_rule_body "$action" "$current")" || return 1
  if [[ -z "$body" || "$body" != *'"rules"'* ]]; then
    echo "ประกอบ ruleset ไม่สำเร็จ จึงไม่เขียนทับกฎเดิม" >&2
    return 1
  fi
  resp="$(cf_request PUT "$url" "$body")" || return 1
  if ! cf_ok "$resp"; then
    echo "ตั้ง SSL ของ ${DOMAIN} ผ่าน Cloudflare ruleset ไม่สำเร็จ ตรวจสิทธิ์ Config Rules Edit ของ token" >&2
    cf_explain "$resp"
    return 1
  fi
}

ensure_hostname_strict_rule() {
  apply_hostname_rule upsert || return 1
  log "ตั้ง SSL strict เฉพาะ ${DOMAIN}"
}

remove_hostname_strict_rule() {
  apply_hostname_rule remove || return 1
  log "เอา SSL rule ของ ${DOMAIN} ออกแล้ว"
}

assert_proxied_dns() {
  local resp verify
  resp="$(cf_request GET "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records?name=${DOMAIN}")" || return 1
  if ! cf_ok "$resp"; then
    echo "อ่าน DNS record จาก Cloudflare ไม่สำเร็จ" >&2
    cf_explain "$resp"
    if ! printf '%s' "$resp" | grep -Eq '"code"[[:space:]]*:[[:space:]]*9106'; then
      verify="$(cf_request GET "https://api.cloudflare.com/client/v4/user/tokens/verify")" || verify=""
      if [[ -n "$verify" ]] && ! cf_ok "$verify"; then
        echo "CF_API_TOKEN ใช้กับ Cloudflare ไม่ได้" >&2
        cf_explain "$verify"
        echo "ใช้ API Token แบบ Bearer ที่ยังไม่ถูกเพิกถอน ไม่ใช่ Global API Key" >&2
      fi
    fi
    echo "ตรวจว่า CF_ZONE_ID เป็น Zone ID ของ ${DOMAIN} จากหน้า Overview ไม่ใช่ Account ID และ token มีสิทธิ์ Zone DNS Read บน zone นี้" >&2
    return 1
  fi
  if ! grep -Eq '"proxied"[[:space:]]*:[[:space:]]*true' <<<"$resp"; then
    echo "${DOMAIN} ต้องเป็น Cloudflare proxied record (เมฆสีส้ม) ใน zone นี้" >&2
    return 1
  fi
  log "พบ proxied DNS record ของ ${DOMAIN}"
}

compose() {
  (
    cd "$ROOT"
    docker compose --env-file "$ROOT/.env" -f "$ROOT/$COMPOSE_FILE" --profile https "$@"
  )
}

nginx_config_test() {
  docker run --rm --entrypoint sh \
    -e "DOMAIN=${DOMAIN}" \
    -v "$NGINX_DIR/nginx.conf.template:/etc/nginx/nginx.conf.template:ro" \
    -v "$NGINX_DIR/cloudflare-real-ip.conf:/etc/nginx/cloudflare-real-ip.conf:ro" \
    -v "$NGINX_CERTS:/etc/nginx/certs:ro" \
    "$NGINX_IMAGE" \
    -c "envsubst '\$DOMAIN' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf && nginx -t"
}

refresh_cloudflare_ips() {
  local backup tmp v4 v6 cidr
  local -a cidrs=()
  backup="$(mktemp)"
  tmp="$(mktemp)"
  cp "$NGINX_DIR/cloudflare-real-ip.conf" "$backup"
  if ! v4="$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v4)" || ! v6="$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v6)"; then
    log "อัปเดตช่วง IP ของ Cloudflare ไม่ได้ ใช้ไฟล์ที่มีอยู่"
    rm -f "$backup" "$tmp"
    return 0
  fi
  while IFS= read -r cidr; do
    cidr="${cidr%$'\r'}"
    if [[ "$cidr" =~ ^[0-9a-fA-F:.]+/[0-9]+$ ]]; then
      cidrs+=("$cidr")
    fi
  done <<<"${v4}"$'\n'"${v6}"
  if [[ ${#cidrs[@]} -eq 0 ]]; then
    log "รายการ IP ที่ได้ไม่ถูกต้อง ใช้ไฟล์เดิม"
    rm -f "$backup" "$tmp"
    return 0
  fi
  {
    echo "# Refreshed from www.cloudflare.com/ips-v4 and ips-v6."
    echo "# $(TZ=Asia/Bangkok date '+%Y-%m-%d %H:%M:%S %z')"
    for cidr in "${cidrs[@]}"; do
      echo "set_real_ip_from ${cidr};"
    done
    echo "geo \$realip_remote_addr \$pms_cloudflare_client {"
    echo "  default 0;"
    for cidr in "${cidrs[@]}"; do
      echo "  ${cidr} 1;"
    done
    echo "}"
    echo "real_ip_header CF-Connecting-IP;"
    echo "real_ip_recursive on;"
  } >"$tmp"
  mv "$tmp" "$NGINX_DIR/cloudflare-real-ip.conf"
  if ! nginx_config_test; then
    log "config หลังอัปเดต IP ไม่ผ่าน จะคืนไฟล์เดิม"
    mv "$backup" "$NGINX_DIR/cloudflare-real-ip.conf"
    return 0
  fi
  rm -f "$backup"
}

bootstrap_self_signed() {
  mkdir -p "$NGINX_CERTS"
  if [[ -s "$NGINX_CERTS/fullchain.pem" && -s "$NGINX_CERTS/privkey.pem" ]]; then
    log "มีไฟล์ certificate อยู่แล้ว จะไม่สร้าง self-signed ทับ"
    return 0
  fi
  log "กำลังสร้าง self-signed certificate ชั่วคราวสำหรับ ${DOMAIN}"
  if command -v openssl >/dev/null 2>&1; then
    openssl req -x509 -nodes -newkey rsa:2048 -days 7 \
      -keyout "$NGINX_CERTS/privkey.pem" \
      -out "$NGINX_CERTS/fullchain.pem" \
      -subj "/CN=${DOMAIN}" \
      -addext "subjectAltName=DNS:${DOMAIN}"
  else
    docker run --rm --entrypoint openssl \
      -v "$NGINX_CERTS:/certs" \
      "$OPENSSL_IMAGE" \
      req -x509 -nodes -newkey rsa:2048 -days 7 \
      -keyout /certs/privkey.pem \
      -out /certs/fullchain.pem \
      -subj "/CN=${DOMAIN}" \
      -addext "subjectAltName=DNS:${DOMAIN}"
  fi
  chmod 644 "$NGINX_CERTS/fullchain.pem"
  chmod 600 "$NGINX_CERTS/privkey.pem"
}

run_certbot_issue() {
  mkdir -p "$CERTBOT_CONF" "$CERTBOT_WWW"
  if [[ "$CERTBOT_STAGING" == "1" ]]; then
    log "CERTBOT_STAGING=1 ออกใบกับ Let's Encrypt staging CA ซึ่ง browser ไม่เชื่อถือเป็น origin certificate"
    docker run --rm \
      -v "$CERTBOT_CONF:/etc/letsencrypt" \
      -v "$CERTBOT_WWW:/var/www/certbot" \
      "$CERTBOT_IMAGE" \
      certonly \
      --webroot -w /var/www/certbot \
      --cert-name "$CERT_NAME" \
      -d "$DOMAIN" \
      --email "$EMAIL" \
      --agree-tos \
      --no-eff-email \
      --non-interactive \
      --keep-until-expiring \
      --test-cert
    return 0
  fi
  docker run --rm \
    -v "$CERTBOT_CONF:/etc/letsencrypt" \
    -v "$CERTBOT_WWW:/var/www/certbot" \
    "$CERTBOT_IMAGE" \
    certonly \
    --webroot -w /var/www/certbot \
    --cert-name "$CERT_NAME" \
    -d "$DOMAIN" \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    --non-interactive \
    --keep-until-expiring
}

run_certbot_renew() {
  mkdir -p "$CERTBOT_CONF" "$CERTBOT_WWW"
  docker run --rm \
    -v "$CERTBOT_CONF:/etc/letsencrypt" \
    -v "$CERTBOT_WWW:/var/www/certbot" \
    "$CERTBOT_IMAGE" \
    renew \
    --cert-name "$CERT_NAME" \
    --quiet \
    --non-interactive
}

production_lineage_exists() {
  [[ -f "$CERTBOT_CONF/renewal/${DOMAIN}.conf" || -d "$CERTBOT_CONF/live/${DOMAIN}" ]]
}

refuse_staging_over_production() {
  if [[ "$CERTBOT_STAGING" != "1" ]]; then
    return 0
  fi
  if production_lineage_exists; then
    echo "มี certificate จริงของ ${DOMAIN} อยู่แล้ว จึงไม่ออกใบ staging ทับ" >&2
    return 1
  fi
}

delete_staging_lineage() {
  local name="${DOMAIN}-staging"
  if [[ ! -f "$CERTBOT_CONF/renewal/${name}.conf" && ! -d "$CERTBOT_CONF/live/${name}" ]]; then
    return 0
  fi
  log "ลบ lineage staging ${name}"
  docker run --rm \
    -v "$CERTBOT_CONF:/etc/letsencrypt" \
    "$CERTBOT_IMAGE" \
    delete \
    --cert-name "$name" \
    --non-interactive
}

deploy_certs() {
  local live_dir="$CERTBOT_CONF/live/${CERT_NAME}"
  if [[ ! -f "$live_dir/fullchain.pem" || ! -f "$live_dir/privkey.pem" ]]; then
    echo "ไม่พบ certificate ของ ${CERT_NAME}" >&2
    exit 1
  fi
  mkdir -p "$NGINX_CERTS"
  cp -L "$live_dir/fullchain.pem" "$NGINX_CERTS/fullchain.pem"
  cp -L "$live_dir/privkey.pem" "$NGINX_CERTS/privkey.pem"
  chmod 644 "$NGINX_CERTS/fullchain.pem"
  chmod 600 "$NGINX_CERTS/privkey.pem"
}

reload_nginx() {
  log "กำลังตรวจ config แล้ว reload nginx"
  compose exec -T "$NGINX_SERVICE" nginx -t
  compose exec -T "$NGINX_SERVICE" nginx -s reload
}

sync_certificate() {
  local live="$CERTBOT_CONF/live/${CERT_NAME}/fullchain.pem"
  local stamp="$NGINX_CERTS/.deployed-mtime"
  local live_mtime deployed=""
  if [[ ! -f "$live" ]]; then
    echo "ไม่พบ certificate ที่ ${live}" >&2
    exit 1
  fi
  live_mtime="$(stat -c %Y "$live")"
  if [[ -f "$stamp" ]]; then
    deployed="$(tr -d '\r\n' <"$stamp")"
  fi
  if [[ "$deployed" == "$live_mtime" && -f "$NGINX_CERTS/fullchain.pem" && -f "$NGINX_CERTS/privkey.pem" ]]; then
    log "certificate ไม่เปลี่ยน จึงไม่ reload nginx"
    return 0
  fi
  deploy_certs
  reload_nginx
  printf '%s\n' "$live_mtime" >"$stamp"
  log "deploy certificate แล้ว reload nginx"
}

require_app_health() {
  local url="http://127.0.0.1:${APP_PORT}/api/health"
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$url" || true)"
  if [[ "$code" != "200" ]]; then
    echo "แอปยังไม่พร้อมที่ ${url} (HTTP ${code}). เริ่ม production ก่อน แล้วตรวจ bash scripts/docker-prod.sh health" >&2
    return 1
  fi
  log "health บน loopback ตอบ 200"
}

verify_public_health() {
  local url="https://${DOMAIN}/api/health"
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 30 "$url" || true)"
  if [[ "$code" != "200" ]]; then
    echo "ตรวจ ${url} ไม่ได้ HTTP 200 (ได้ ${code})" >&2
    return 1
  fi
  log "ตรวจ ${url} ได้ HTTP 200"
}

port_owned_by_nginx() {
  local port="$1"
  local ports
  ports="$(docker ps --filter 'name=pms-nginx-prod' --format '{{.Names}} {{.Ports}}' 2>/dev/null || true)"
  [[ "$ports" == pms-nginx-prod\ * && "$ports" == *":${port}->"* ]]
}

assert_ports_available() {
  local port listeners others
  for port in 80 443; do
    if port_owned_by_nginx "$port"; then
      continue
    fi
    others="$(docker ps --format '{{.Names}} {{.Ports}}' | grep -E ":${port}->" | grep -v 'pms-nginx-prod' || true)"
    if [[ -n "$others" ]]; then
      echo "พอร์ต ${port} ถูกใช้โดย container อื่น:" >&2
      echo "$others" >&2
      return 1
    fi
    if command -v ss >/dev/null 2>&1; then
      listeners="$(ss -ltn | grep -E ":${port}([^0-9]|$)" || true)"
      if [[ -n "$listeners" ]]; then
        echo "พอร์ต ${port} ถูกใช้งานอยู่แล้ว แต่ไม่ใช่ pms-nginx-prod" >&2
        return 1
      fi
    fi
  done
}

acquire_lock() {
  mkdir -p "$CERTBOT_DIR/logs"
  if ! command -v flock >/dev/null 2>&1; then
    log "ไม่พบ flock จึงไม่ได้ล็อกกันรันซ้อน"
    return 0
  fi
  exec 9>"$CERTBOT_DIR/logs/setup.lock"
  if ! flock -n 9; then
    echo "มีคำสั่ง HTTPS อื่นกำลังทำงาน" >&2
    exit 1
  fi
}

host_timezone() {
  local tz=""
  if command -v timedatectl >/dev/null 2>&1; then
    tz="$(timedatectl show -p Timezone --value 2>/dev/null || true)"
  fi
  if [[ -z "$tz" && -f /etc/timezone ]]; then
    tz="$(tr -d ' \r\n' </etc/timezone)"
  fi
  printf '%s' "$tz"
}

install_cron() {
  local root_q script_q log_q host_tz dest
  if [[ "$CERTBOT_STAGING" == "1" ]]; then
    log "ใบ staging ไม่ติดตั้ง cron ต่ออายุ"
    return 0
  fi
  if [[ "$ROOT" == *%* ]]; then
    echo "path ของ repository มี % ซึ่ง cron ใช้เป็นอักขระพิเศษ" >&2
    return 1
  fi
  host_tz="$(host_timezone)"
  host_tz="${host_tz%$'\r'}"
  dest="${CRON_DEST:-/etc/cron.d/pms-https}"
  if [[ "$host_tz" != "Asia/Bangkok" ]]; then
    echo "ไม่ได้ติดตั้ง cron เพราะ timezone ของเครื่องคือ ${host_tz:-unknown} ไม่ใช่ Asia/Bangkok" >&2
    echo "ตั้ง timezone ของเครื่องเป็น Asia/Bangkok แล้วรันสคริปต์อีกครั้ง" >&2
    return 1
  fi
  mkdir -p "$CERTBOT_DIR/logs"
  mkdir -p "$(dirname "$dest")"
  root_q="$(printf '%q' "$ROOT")"
  script_q="$(printf '%q' "$ROOT/infra/certbot/setup-https.sh")"
  log_q="$(printf '%q' "$CERTBOT_DIR/logs/renew.log")"
  cat >"$dest" <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
15 3,15 * * * root cd ${root_q} && TZ=Asia/Bangkok bash ${script_q} renew >> ${log_q} 2>&1
EOF
  chmod 644 "$dest"
  log "ติดตั้ง ${dest} แล้ว (03:15 และ 15:15 ตามเวลาท้องถิ่น Asia/Bangkok)"
}

start_nginx() {
  log "กำลัง start nginx"
  compose up -d --no-deps "$NGINX_SERVICE"
}
