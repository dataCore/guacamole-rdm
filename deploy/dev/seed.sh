#!/bin/sh
# Seeds the dev stack with a small folder tree and SSH connections to the
# bundled target (SFTP on, so `guacctl -d <file>` tests downloads).
# Idempotent enough for dev: re-running adds duplicates only where Guacamole
# allows them (it rejects same name in same folder).
set -eu
BASE="${BASE:-http://127.0.0.1:18080/guacamole}"
TOKEN=$(curl -fsS -X POST -d 'username=guacadmin&password=guacadmin' "$BASE/api/tokens" \
  | sed -n 's/.*"authToken":"\([^"]*\)".*/\1/p')
API="$BASE/api/session/data/postgresql"

post() { curl -sS -X POST -H "Guacamole-Token: $TOKEN" -H 'Content-Type: application/json' "$API/$1" -d "$2"; }
group() { post connectionGroups "{\"parentIdentifier\":\"$2\",\"name\":\"$1\",\"type\":\"ORGANIZATIONAL\",\"attributes\":{}}" \
  | sed -n 's/.*"identifier":"\([^"]*\)".*/\1/p'; }
ssh_conn() {
  post connections "{\"parentIdentifier\":\"$2\",\"name\":\"$1\",\"protocol\":\"ssh\",\"parameters\":{\"hostname\":\"ssh\",\"port\":\"2222\",\"username\":\"test\",\"password\":\"test\",\"enable-sftp\":\"true\"},\"attributes\":{}}" >/dev/null
}

SITEA=$(group "Site A" ROOT)
TEST=$(group Test "$SITEA")
SITEB=$(group "Site B" ROOT)
for n in admin01 build01 cloud01 code01; do ssh_conn "$n" "$SITEA"; done
ssh_conn testBox01 "$TEST"
ssh_conn web01 "$SITEB"
ssh_conn db01 "$SITEB"
# Points nowhere on purpose: shows the error state of a tab.
post connections "{\"parentIdentifier\":\"$SITEA\",\"name\":\"unreachable01\",\"protocol\":\"rdp\",\"parameters\":{\"hostname\":\"192.0.2.1\",\"port\":\"3389\"},\"attributes\":{}}" >/dev/null
# No password stored: guacd asks for it, the tab shows the credential prompt.
post connections "{\"parentIdentifier\":\"$TEST\",\"name\":\"vncPrompt01\",\"protocol\":\"vnc\",\"parameters\":{\"hostname\":\"vnc\",\"port\":\"5900\"},\"attributes\":{}}" >/dev/null
echo "seeded"
