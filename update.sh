#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker tidak ditemukan."
  exit 1
fi

if [ ! -d .git ]; then
  echo "Folder ini bukan hasil clone GitHub."
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Ada perubahan source lokal. Commit atau simpan sebelum update."
  exit 1
fi

echo "Membuat backup sebelum update..."
docker compose exec -T media-hub node -e "require('./src/db').createDatabaseBackup('pre-update').then(console.log).catch(e=>{console.error(e);process.exit(1)})"

current_branch="$(git branch --show-current)"
git fetch origin "$current_branch"
git pull --ff-only origin "$current_branch"
docker compose up -d --build --force-recreate

app_port="$(sed -n 's/^APP_PORT=//p' .env 2>/dev/null | tail -n 1)"
app_port="${app_port:-8095}"
echo "Update selesai."
curl --fail --silent "http://127.0.0.1:$app_port/api/health" || true
echo
