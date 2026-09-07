#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker tidak ditemukan. Pastikan CasaOS dan Docker sudah aktif."
  exit 1
fi

if [ ! -f .env ]; then
  if command -v openssl >/dev/null 2>&1; then
    app_pepper="$(openssl rand -hex 48)"
    admin_password="Admin-$(openssl rand -hex 6)A1"
  else
    app_pepper="$(od -An -N48 -tx1 /dev/urandom | tr -d ' \n')"
    admin_password="Admin-$(od -An -N6 -tx1 /dev/urandom | tr -d ' \n')A1"
  fi
  cp .env.example .env
  sed -i "s/GANTI_DENGAN_RANDOM_SECRET_MINIMAL_64_KARAKTER/$app_pepper/" .env
  sed -i "s/GantiPasswordAdmin123/$admin_password/" .env
  chmod 600 .env
  echo "Kredensial awal dibuat:"
  echo "Username: admin"
  echo "Password: $admin_password"
  echo "Simpan password ini dan ubah setelah login pertama."
fi

mkdir -p /DATA/AppData/media-hub/database \
  /DATA/AppData/media-hub/uploads/drafts \
  /DATA/AppData/media-hub/uploads/library \
  /DATA/AppData/media-hub/uploads/proofs \
  /DATA/AppData/media-hub/backups
chown -R 1000:1000 /DATA/AppData/media-hub/database /DATA/AppData/media-hub/uploads /DATA/AppData/media-hub/backups

docker compose up -d --build

app_port="$(sed -n 's/^APP_PORT=//p' .env | tail -n 1)"
app_port="${app_port:-8094}"
echo "AXINDO Media Hub aktif di http://IP-CASAOS:$app_port"
echo "Cek status: docker compose ps"
echo "Cek log: docker compose logs -f media-hub"
