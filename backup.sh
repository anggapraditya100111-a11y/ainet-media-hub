#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
timestamp="$(date +%Y%m%d-%H%M%S)"
data_root="$(sed -n 's/^DATA_ROOT=//p' .env 2>/dev/null | tail -n 1)"
data_root="${data_root:-./runtime}"
if [ "$data_root" = "/" ] || [ "$data_root" = "." ] || [ "$data_root" = "./" ]; then
  echo "DATA_ROOT tidak aman; backup dibatalkan."
  exit 1
fi
target="$data_root/backups/media-hub-full-$timestamp.tar.gz"

mkdir -p "$data_root/backups"
tar --exclude='backups' -czf "$target" -C "$data_root" database uploads
echo "Backup lengkap dibuat: $target"
