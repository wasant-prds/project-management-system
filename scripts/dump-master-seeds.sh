#!/bin/sh
# Export the running PostgreSQL database into database/seeds/master/*.json
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
CONTAINER="${POSTGRES_CONTAINER:-pms-postgres-dev}"
DEST="${ROOT}/database/seeds/master"
INNER="${ROOT}/scripts/dump-master-seeds-inner.sh"

if ! docker ps -q -f "name=${CONTAINER}" | grep -q .; then
  echo "PostgreSQL container is not running: ${CONTAINER}" >&2
  exit 1
fi

mkdir -p "${DEST}"

docker cp "${INNER}" "${CONTAINER}:/tmp/dump-master-seeds-inner.sh"
docker exec "${CONTAINER}" sed -i 's/\r$//' /tmp/dump-master-seeds-inner.sh
docker exec "${CONTAINER}" sh /tmp/dump-master-seeds-inner.sh
docker cp "${CONTAINER}:/tmp/seeds-master/." "${DEST}/"

node -e "
const fs = require('fs');
const path = require('path');
const dir = process.argv[1];
for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'config.json')) {
  const file = path.join(dir, name);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}
" "${DEST}"

echo "Wrote JSON seeds to ${DEST}"
echo "Config unchanged: ${DEST}/config.json"
