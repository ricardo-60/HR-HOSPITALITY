#!/usr/bin/env bash
# ============================================================
#  HR-HOSPITALITY â€” Servidor local (arranque em 1 clique)
# ============================================================
#  Uso, a partir da raiz do repositÃ³rio:
#      ./start-server.sh            # usa o build existente, se houver
#      ./start-server.sh --rebuild  # forÃ§a nova compilaÃ§Ã£o do frontend
#
#  O que faz, por ordem:
#    1. Garante hr-hospitality-app/.env.local (copiado de .env.example)
#    2. MigraÃ§Ãµes SQLite locais (001..007) + seeders de demonstraÃ§Ã£o
#    3. MigraÃ§Ãµes Supabase 001..008 + seeders, SE existirem credenciais de BD
#       no ambiente (PGPASSWORD / SUPABASE_DB_HOST) â€” nunca em ficheiros
#    4. Build estÃ¡tico do Next.js (modo ligado ou MODO DEMONSTRAÃ‡ÃƒO)
#    5. Serve o portal em 0.0.0.0:3000 e imprime o endereÃ§o da LAN + QR
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

PORT="${HR_PORT:-3000}"
REBUILD="${1:-}"

echo
echo "  == HR-HOSPITALITY :: Servidor Local (arranque em 1 clique) =="

if ! command -v node >/dev/null 2>&1; then
  echo "  [ERRO] Node.js nÃ£o encontrado. Instale em https://nodejs.org/ (LTS)."
  exit 1
fi

# â”€â”€â”€ 1. ConfiguraÃ§Ã£o pÃºblica â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if [ ! -f hr-hospitality-app/.env.local ]; then
  cp hr-hospitality-app/.env.example hr-hospitality-app/.env.local
  echo "  [OK] Criado hr-hospitality-app/.env.local a partir de .env.example"
fi

HR_SUPA_URL="$(sed -n 's/^NEXT_PUBLIC_SUPABASE_URL[[:space:]]*=[[:space:]]*//p' hr-hospitality-app/.env.local | head -n1 | tr -d "\"' \r")"
HR_HAS_CREDS=0
if [ -n "${HR_SUPA_URL:-}" ] && [ "$HR_SUPA_URL" != "https://SEU-PROJETO.supabase.co" ]; then
  HR_HAS_CREDS=1
fi

if [ "$HR_HAS_CREDS" = "1" ]; then
  echo "  [OK] Supabase configurado em .env.local â€” build operacional."
else
  echo "  [AVISO] Supabase NÃƒO configurado â€” o painel arranca em MODO DEMONSTRAÃ‡ÃƒO."
  echo "          Para modo ligado, edite hr-hospitality-app/.env.local e corre novamente."
fi

# â”€â”€â”€ 2. MigraÃ§Ãµes + seeders locais â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
echo
echo "  [1/5] MigraÃ§Ãµes SQLite locais..."
node hr-hospitality-app/scripts/run_migrations.mjs --target=sqlite

echo "  [2/5] Seeders de demonstraÃ§Ã£o..."
node hr-hospitality-app/scripts/seed.mjs --target=sqlite

# â”€â”€â”€ 3. MigraÃ§Ãµes Supabase (apenas com credenciais de BD no ambiente) â”€â”€â”€â”€â”€â”€â”€â”€
echo "  [3/5] MigraÃ§Ãµes Supabase 001..008 + seeders..."
if [ "$HR_HAS_CREDS" = "1" ] && [ -n "${PGPASSWORD:-}" ] && [ -n "${SUPABASE_DB_HOST:-}" ]; then
  node hr-hospitality-app/scripts/run_migrations.mjs --target=supabase
  node hr-hospitality-app/scripts/seed.mjs --target=supabase
else
  echo "        Ignorado (sem PGPASSWORD/SUPABASE_DB_HOST no ambiente)."
fi

# â”€â”€â”€ 4. Build do frontend â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
NEED_BUILD=0
[ -f hr-hospitality-app/out/index.html ] || NEED_BUILD=1
if [ "$REBUILD" = "--rebuild" ] || [ "$REBUILD" = "-r" ]; then
  NEED_BUILD=1
fi

if [ "$NEED_BUILD" = "0" ]; then
  echo "  [4/5] Frontend jÃ¡ compilado â€” a reutilizar hr-hospitality-app/out"
  echo "        (corra \"./start-server.sh --rebuild\" para forÃ§ar nova compilaÃ§Ã£o)"
else
  echo "  [4/5] A compilar o frontend Next.js..."
  pushd hr-hospitality-app >/dev/null
  if [ "$HR_HAS_CREDS" = "1" ]; then
    npm run build
  else
    HR_DEMO_BUILD=1 npm run build
  fi
  popd >/dev/null
fi

# â”€â”€â”€ 5. EndereÃ§o na rede local â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
HR_IP="$(node -e '
const os = require("node:os");
const nets = os.networkInterfaces();
for (const name of Object.keys(nets)) {
  for (const net of nets[name] || []) {
    if (net.family === "IPv4" && !net.internal && !net.address.startsWith("169.254.")) {
      console.log(net.address);
      process.exit(0);
    }
  }
}
' 2>/dev/null || true)"
HR_IP="${HR_IP:-127.0.0.1}"

echo
echo "  ============================================================"
echo "   SERVIDOR A ARRANCAR"
echo "   Portal          : http://localhost:$PORT"
echo "   Na rede local   : http://$HR_IP:$PORT"
echo "   Downloads + QR  : http://$HR_IP:$PORT/download/"
echo "  ============================================================"
echo

mkdir -p dist/download
if [ -f hr-hospitality-app/scripts/qr.mjs ]; then
  node hr-hospitality-app/scripts/qr.mjs "http://$HR_IP:$PORT/download/" \
    --out="dist/download/qr-portal.svg" \
    || echo "  [AVISO] QR nÃ£o gerado (corra \"npm i -D qrcode\" em hr-hospitality-app)."
fi

echo
echo "  [5/5] A preparar a Ã¡rea de download..."
node hr-hospitality-app/scripts/stage_downloads.mjs --ip="$HR_IP" --port="$PORT"

HOST=0.0.0.0 PORT="$PORT" node hr-hospitality-app/scripts/serve_static.mjs
