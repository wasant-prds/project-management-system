#!/usr/bin/env bash
# Issue or renew the production HTTPS certificate and attach it to nginx.
#
# Usage (on the Linux server, as root):
#   sudo bash infra/certbot/setup-https.sh
#   sudo CERTBOT_STAGING=1 bash infra/certbot/setup-https.sh --yes
#   sudo bash infra/certbot/setup-https.sh renew
#
# The script reads DOMAIN, EMAIL, CF_API_TOKEN, CF_ZONE_ID, APP_ORIGIN and
# APP_ENV from the root .env allowlist. It does not modify .env or the database.
# Zone SSL mode is restored to the value found before issuance. Strict TLS for
# this hostname is a Cloudflare configuration rule, not a zone-wide change.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

MODE="setup"
ASSUME_YES=0

usage() {
  echo "ใช้: sudo bash infra/certbot/setup-https.sh [--yes] [renew]"
  echo "  ไม่ใส่ renew  = ออก certificate, start nginx, ติดตั้ง cron ต่ออายุ"
  echo "  renew         = ต่ออายุเมื่อใกล้หมด แล้ว reload nginx เฉพาะเมื่อใบเปลี่ยน"
  echo "  --yes         = ไม่ถามยืนยันก่อน start/reload nginx บน production"
}

for arg in "$@"; do
  case "$arg" in
    renew) MODE="renew" ;;
    --yes | -y) ASSUME_YES=1 ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
done

confirm_prod() {
  local answer
  if [[ "$ASSUME_YES" == "1" ]]; then
    return 0
  fi
  if [[ ! -t 0 ]]; then
    echo "ไม่มี TTY สำหรับยืนยัน production ให้รันใหม่พร้อม --yes" >&2
    exit 1
  fi
  echo "คำสั่งนี้จะ start หรือ reload nginx ของ production บนพอร์ต 80 และ 443 สำหรับ ${DOMAIN}"
  echo "พิมพ์ yes เพื่อทำต่อ:"
  read -r answer
  if [[ "$answer" != "yes" ]]; then
    echo "ยกเลิกแล้ว"
    exit 0
  fi
}

setup_main() {
  validate_issue_inputs
  refuse_staging_over_production
  assert_proxied_dns
  assert_ports_available
  require_app_health
  confirm_prod
  acquire_lock
  trap restore_original_ssl_mode EXIT
  bootstrap_self_signed
  refresh_cloudflare_ips
  nginx_config_test
  start_nginx
  relax_ssl_for_issuance
  log "กำลังขอ certificate จาก Let's Encrypt"
  run_certbot_issue
  sync_certificate
  restore_original_ssl_mode
  if [[ "$CERTBOT_STAGING" == "1" ]]; then
    verify_public_health
    echo "ออก staging certificate แล้ว คืน zone SSL mode เดิม และยังไม่ตั้ง strict ของ hostname นี้"
    echo "เมื่อพร้อมให้ออกใบจริง ให้รันโดยไม่ตั้ง CERTBOT_STAGING"
    return 0
  fi
  delete_staging_lineage || log "ลบ lineage staging ไม่สำเร็จ การต่ออายุใบจริงยังระบุชื่อใบ"
  if ! ensure_hostname_strict_rule; then
    exit 1
  fi
  if ! verify_public_health; then
    log "health ผ่าน Cloudflare ไม่สำเร็จ จะเอา SSL rule ของ hostname นี้ออก"
    remove_hostname_strict_rule || true
    exit 1
  fi
  install_cron
  log "เสร็จแล้ว เปิด https://${DOMAIN} ได้"
}

renew_main() {
  refuse_staging_over_production
  acquire_lock
  log "กำลังตรวจการต่ออายุ certificate ของ ${CERT_NAME}"
  run_certbot_renew
  sync_certificate
  log "ตรวจต่ออายุเสร็จ"
}

load_env
apply_defaults
require_cmd docker curl
require_root
validate_common
if [[ "$MODE" == "renew" ]]; then
  renew_main
else
  setup_main
fi
