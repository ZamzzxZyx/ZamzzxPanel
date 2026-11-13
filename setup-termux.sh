#!/data/data/com.termux/files/usr/bin/bash
# Jalankan sekali: bash setup-termux.sh
set -e
cd "$(dirname "$0")"

echo "[1/3] Memasang Node.js dan alat bantu..."
pkg update -y
pkg install -y nodejs unzip nano
pkg install -y cloudflared || echo "cloudflared gagal dipasang. Lewati dulu, panel tetap bisa jalan di localhost."

echo "[2/3] Memasang dependensi panel..."
npm install --omit=dev

echo "[3/3] Menyiapkan file .env..."
if [ ! -f .env ]; then
  cp .env.example .env
  SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  sed -i "s/^SESSION_SECRET=.*/SESSION_SECRET=$SECRET/" .env
  echo ".env dibuat dan SESSION_SECRET sudah diisi otomatis."
else
  echo ".env sudah ada, tidak diubah."
fi

echo ""
echo "Selesai. Langkah berikutnya:"
echo "  1. nano .env   (isi PANEL_PASSWORD, CF_API_TOKEN, CF_ZONE_ID, dan TUNNEL_TOKEN kalau ada)"
echo "  2. bash start.sh"
