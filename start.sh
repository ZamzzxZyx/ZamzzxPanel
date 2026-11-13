#!/data/data/com.termux/files/usr/bin/bash
# Menjalankan panel (dan tunnel kalau TUNNEL_TOKEN diisi): bash start.sh
cd "$(dirname "$0")" || exit 1

if [ ! -f .env ]; then
  echo "File .env belum ada. Jalankan dulu: bash setup-termux.sh"
  exit 1
fi

command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock

TOKEN=$(grep -E '^TUNNEL_TOKEN=' .env | head -n1 | cut -d= -f2- | tr -d "\"' \r")
TUNNEL_PID=""
if [ -n "$TOKEN" ]; then
  if command -v cloudflared >/dev/null 2>&1; then
    cloudflared tunnel run --token "$TOKEN" >tunnel.log 2>&1 &
    TUNNEL_PID=$!
    echo "Tunnel dijalankan (log di tunnel.log)"
  else
    echo "TUNNEL_TOKEN terisi tapi cloudflared belum terpasang: pkg install cloudflared"
  fi
fi

cleanup() {
  [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null
  command -v termux-wake-unlock >/dev/null 2>&1 && termux-wake-unlock
}
trap cleanup EXIT INT TERM

node server.js
