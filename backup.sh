#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")"

timestamp="$(date +%Y%m%d-%H%M%S)"
data_root="$(sed -n 's/^DATA_ROOT=//p' .env 2>/dev/null | tail -n 1)"
data_root="${data_root:-./runtime}"
backup_root="$(sed -n 's/^BACKUP_ROOT=//p' .env 2>/dev/null | tail -n 1)"
backup_root="${backup_root:-./runtime/backups}"

if [ "$data_root" = "/" ] || [ "$data_root" = "." ] || [ "$data_root" = "./" ]; then
  echo "DATA_ROOT tidak aman; backup dibatalkan."
  exit 1
fi
if [ "$backup_root" = "/" ] || [ "$backup_root" = "." ] || [ "$backup_root" = "./" ]; then
  echo "BACKUP_ROOT tidak aman; backup dibatalkan."
  exit 1
fi

data_root="$(realpath -m "$data_root")"
backup_dir="$(realpath -m "$backup_root")"
target="$backup_dir/media-hub-full-$timestamp.tar.gz"
partial="$target.partial"
stage_dir="$(mktemp -d)"

cleanup() {
  rm -rf "$stage_dir"
  rm -f "$partial"
}
trap cleanup EXIT

mkdir -p "$backup_dir"

if ! docker compose ps --status running --services | grep -qx 'media-hub'; then
  echo "Container media-hub tidak sedang berjalan; backup dibatalkan."
  exit 1
fi

echo "Membuat snapshot SQLite konsisten..."
snapshot_container_path="$(
  docker compose exec -T media-hub node -e "
    require('./src/db')
      .createDatabaseBackup('full')
      .then(file => console.log(file))
      .catch(error => {
        console.error(error);
        process.exit(1);
      });
  " | tail -n 1 | tr -d '\r'
)"

snapshot_name="$(basename "$snapshot_container_path")"
snapshot_host_path="$backup_dir/$snapshot_name"

if [ ! -s "$snapshot_host_path" ]; then
  echo "Snapshot database tidak ditemukan atau kosong: $snapshot_host_path"
  exit 1
fi

echo "Memvalidasi snapshot SQLite..."
docker compose exec -T media-hub node -e "
  const path = require('node:path');
  const { DatabaseSync } = require('node:sqlite');
  const file = path.join('/app/backups', process.argv[1]);
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const row = db.prepare('PRAGMA quick_check').get();
    const value = row && Object.values(row)[0];
    if (value !== 'ok') {
      console.error('PRAGMA quick_check gagal:', value);
      process.exit(1);
    }
    console.log('quick_check: ok');
  } finally {
    db.close();
  }
" "$snapshot_name"

mkdir -p "$stage_dir/database"
cp -f "$snapshot_host_path" "$stage_dir/database/media-hub.sqlite"

echo "Membuat backup lengkap database + uploads..."
tar -czf "$partial"   -C "$stage_dir" database   -C "$data_root" uploads

mv "$partial" "$target"
chmod 600 "$target"

# Hanya hapus backup otomatis/full yang lebih tua dari 30 hari.
# Backup manual dari UI tidak disentuh.
find "$backup_dir" -maxdepth 1 -type f   \( -name 'media-hub-full-*.tar.gz' -o -name 'media-hub-full-*.sqlite' \)   -mtime +30 -delete

echo "Backup lengkap berhasil dibuat: $target"
echo "Snapshot database: $snapshot_host_path"
