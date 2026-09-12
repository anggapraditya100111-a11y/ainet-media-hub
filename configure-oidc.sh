#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "File .env belum ada. Jalankan ./install.sh terlebih dahulu."
  exit 1
fi

current_value() {
  local key="$1"
  sed -n "s/^${key}=//p" .env | tail -n 1
}

set_env() {
  local key="$1" value="$2" temp found="false"
  temp="$(mktemp .env.tmp.XXXXXX)"
  while IFS= read -r line || [ -n "$line" ]; do
    if [[ "$line" == "$key="* ]]; then
      printf '%s=%s\n' "$key" "$value" >> "$temp"
      found="true"
    else
      printf '%s\n' "$line" >> "$temp"
    fi
  done < .env
  if [ "$found" = "false" ]; then printf '%s=%s\n' "$key" "$value" >> "$temp"; fi
  chmod 600 "$temp"
  mv "$temp" .env
}

default_issuer="$(current_value OIDC_ISSUER_URL)"
default_issuer="${default_issuer:-https://sso.axindo.my.id/application/o/axindo-media-hub/}"

echo "Konfigurasi AXINDO ID untuk Media Hub"
read -r -p "URL Media Hub (contoh https://mediahub.axindo.my.id): " app_url
app_url="${app_url%/}"
if [[ ! "$app_url" =~ ^https?://[^/]+ ]]; then
  echo "URL Media Hub tidak valid."
  exit 1
fi

read -r -p "Issuer Authentik [$default_issuer]: " issuer
issuer="${issuer:-$default_issuer}"
issuer="${issuer%/}/"

default_access_url="$(current_value ACCESS_PORTAL_URL)"
default_access_url="${default_access_url:-https://akses.axindo.my.id}"
read -r -p "URL AXINDO Access [$default_access_url]: " access_url
access_url="${access_url:-$default_access_url}"
access_url="${access_url%/}"
if [[ ! "$access_url" =~ ^https?://[^/]+ ]]; then
  echo "URL AXINDO Access tidak valid."
  exit 1
fi

existing_client_id="$(current_value OIDC_CLIENT_ID)"
read -r -p "Client ID${existing_client_id:+ (Enter untuk mempertahankan yang tersimpan)}: " client_id
client_id="${client_id:-$existing_client_id}"
if [ -z "$client_id" ]; then
  echo "Client ID wajib diisi."
  exit 1
fi

existing_secret="$(current_value OIDC_CLIENT_SECRET)"
read -r -s -p "Client Secret${existing_secret:+ (Enter untuk mempertahankan yang tersimpan)}: " client_secret
echo
client_secret="${client_secret:-$existing_secret}"
if [ -z "$client_secret" ]; then
  echo "Client Secret wajib diisi."
  exit 1
fi

redirect_uri="$app_url/api/auth/oidc/callback"
set_env PUBLIC_APP_URL "$app_url"
set_env ACCESS_PORTAL_URL "$access_url"
set_env OIDC_ENABLED true
set_env OIDC_ISSUER_URL "$issuer"
set_env OIDC_CLIENT_ID "$client_id"
set_env OIDC_CLIENT_SECRET "$client_secret"
set_env OIDC_REDIRECT_URI "$redirect_uri"
set_env OIDC_POST_LOGOUT_REDIRECT_URI "$app_url/"
set_env OIDC_SCOPES "openid profile email"
set_env OIDC_AUTO_PROVISION true
set_env LOCAL_PERSONAL_LOGIN_ENABLED true

if [[ "$app_url" == https://* ]]; then
  set_env TRUST_PROXY true
  set_env COOKIE_SECURE true
else
  set_env COOKIE_SECURE false
fi
if [[ "$issuer" == http://* ]]; then set_env OIDC_ALLOW_INSECURE true; else set_env OIDC_ALLOW_INSECURE false; fi

echo
echo "Pastikan Redirect URI di Provider Authentik sama persis:"
echo "$redirect_uri"
echo

docker compose up -d --build --force-recreate
app_port="$(current_value APP_PORT)"
app_port="${app_port:-8095}"
if curl --fail --silent "http://127.0.0.1:$app_port/api/health" >/dev/null; then
  echo "AXINDO ID aktif. Buka $app_url dan uji popup Masuk melalui AXINDO Access."
else
  echo "Container dijalankan, tetapi health check belum siap. Cek: docker compose logs -f media-hub"
fi
