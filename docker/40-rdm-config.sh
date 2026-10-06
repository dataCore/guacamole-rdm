#!/bin/sh
# Renders config.json from RDM_* environment variables on every start. It
# lives in /tmp (tmpfs) because the root filesystem is read-only.
set -eu

json_string() {
  # Escape backslash, double quote and control characters for JSON.
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/\t/\\t/g' | tr -d '\r\n'
}

case "${RDM_AUTO_SSO:-true}" in
  true|false) ;;
  *) echo "RDM_AUTO_SSO must be true or false, got '${RDM_AUTO_SSO}'" >&2; exit 1 ;;
esac

theme="${RDM_THEME:-default}"
case "$theme" in
  ''|*[!a-z0-9-]*|-*) echo "RDM_THEME must match [a-z0-9][a-z0-9-]*, got '$theme'" >&2; exit 1 ;;
esac
if [ ! -f "/usr/share/nginx/html/themes/$theme/theme.css" ]; then
  echo "RDM_THEME=$theme: /usr/share/nginx/html/themes/$theme/theme.css not found" >&2
  exit 1
fi

case "${RDM_LANGUAGE:-auto}" in
  de|en|auto) ;;
  *) echo "RDM_LANGUAGE must be de, en or auto, got '${RDM_LANGUAGE}'" >&2; exit 1 ;;
esac

mkdir -p /tmp/rdm
cat > /tmp/rdm/config.json <<JSON
{
  "title": "$(json_string "${RDM_TITLE:-Remote}")",
  "guacamoleUrl": "$(json_string "${RDM_GUACAMOLE_URL:-/guacamole/}")",
  "autoSso": ${RDM_AUTO_SSO:-true},
  "theme": "$theme",
  "language": "${RDM_LANGUAGE:-auto}"
}
JSON
echo "40-rdm-config.sh: wrote /tmp/rdm/config.json"
