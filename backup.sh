#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
timestamp="$(date +%Y%m%d-%H%M%S)"
target="/DATA/AppData/media-hub/backups/media-hub-full-$timestamp.tar.gz"

mkdir -p /DATA/AppData/media-hub/backups
tar --exclude='backups' -czf "$target" -C /DATA/AppData/media-hub database uploads
echo "Backup lengkap dibuat: $target"
