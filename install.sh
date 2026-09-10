#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker tidak ditemukan. Pasang Docker Engine dan Docker Compose Plugin terlebih dahulu."
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose Plugin tidak ditemukan."
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

data_root="$(sed -n 's/^DATA_ROOT=//p' .env | tail -n 1)"
data_root="${data_root:-./runtime}"
if [ "$data_root" = "/" ] || [ "$data_root" = "." ] || [ "$data_root" = "./" ]; then
  echo "DATA_ROOT tidak aman. Gunakan folder khusus seperti ./runtime atau /var/lib/axindo-media-hub."
  exit 1
fi
mkdir -p "$data_root/database" \
  "$data_root/uploads/drafts" \
  "$data_root/uploads/library" \
  "$data_root/uploads/proofs" \
  "$data_root/uploads/branding" \
  "$data_root/backups"
chown -R 1000:1000 "$data_root/database" "$data_root/uploads" "$data_root/backups"

docker compose up -d --build

app_port="$(sed -n 's/^APP_PORT=//p' .env | tail -n 1)"
app_port="${app_port:-8095}"
echo "AXINDO Media Hub aktif di http://IP-SERVER:$app_port"
echo "Cek status: docker compose ps"
echo "Cek log: docker compose logs -f media-hub"
echo "Setelah domain siap, jalankan ./configure-oidc.sh untuk menghubungkan AXINDO ID."
