#!/usr/bin/env bash
# ============================================================
#  HR-HOSPITALITY — Build iOS (.ipa)
# ============================================================
#  IMPORTANTE: um .ipa só pode ser gerado de duas formas:
#
#   A) Nuvem (EAS) — funciona a partir de QUALQUER SO, incluindo Windows:
#        npx eas-cli build -p ios --profile preview --output dist/ios/app.ipa
#      Requer:
#        • conta Expo (grátis)      → npx eas-cli login
#        • conta Apple Developer     → $99/ano, com App Signing configurado
#      É a via recomendada e a única possível nesta máquina (Windows).
#
#   B) Local — exige macOS com Xcode 16+ :
#        npx expo prebuild --platform ios && cd ios && xcodebuild ...
#
#  Uso:
#      ./build-ios.sh              # build de distribuição (EAS, gera .ipa)
#      ./build-ios.sh simulator    # build para simulador (só macOS)
#      ./build-ios.sh check        # apenas verifica pré-requisitos
# ============================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

OUT_DIR="$ROOT/dist/ios"
mkdir -p "$OUT_DIR"

echo
echo "  == HR-HOSPITALITY :: Build iOS =="

if ! command -v node >/dev/null 2>&1; then
  echo "  [ERRO] Node.js não encontrado."
  exit 1
fi

if [ "$(uname -s 2>/dev/null)" != "Darwin" ]; then
  echo "  [INFO] Sistema actualo não é macOS — o build LOCAL de iOS é impossível."
  echo "         Será usado o build na nuvem (Expo EAS)."
  LOCAL=0
else
  LOCAL=1
  echo "  [OK] macOS detectado — build local disponível."
fi

echo "  [1/3] A verificar o EAS CLI..."
if ! npx --yes eas-cli --version >/dev/null 2>&1; then
  echo "  [ERRO] Não foi possível obter o eas-cli (rede ou npm)."
  exit 1
fi
echo "         eas-cli OK"

MODE="${1:-distribute}"

if [ "$MODE" = "check" ]; then
  echo "  [OK] Pré-requisitos verificados. Corra sem \"check\" para construir."
  exit 0
fi

if [ "$MODE" = "simulator" ]; then
  if [ "$LOCAL" != "1" ]; then
    echo "  [ERRO] Build de simulador requer macOS + Xcode."
    exit 1
  fi
  echo "  [2/3] prebuild iOS..."
  npx expo prebuild --platform ios --no-install || exit 1
  echo "  [3/3] xcodebuild (simulador)..."
  (cd ios && xcodebuild -workspace *.xcworkspace -scheme hr-hospitality-mobile \
      -configuration Debug -sdk iphonesimulator -derivedDataPath build \
      CODE_SIGNING_ALLOWED=NO) || exit 1
  echo "  OK build de simulador concluído (pasta ios/build)."
  exit 0
fi

echo "  [2/3] A construir .ipa na nuvem (EAS)..."
echo "        Perfil: preview (distribution=internal, gera .ipa assinado)"
echo
npx --yes eas-cli build -p ios --profile preview --non-interactive \
  --no-wait --output "$OUT_DIR/HR-Hospitality.ipa"
RC=$?

if [ $RC -ne 0 ]; then
  cat > "$OUT_DIR/README-BUILD-IOS.md" <<'EOF'
# iOS — como gerar o `.ipa`

O build nesta máquina falhou ou não está disponível. Passos manuais:

```bash
# 1. login na conta Expo (grátis)
npx eas-cli login

# 2. pré-requisitos Apple: conta Apple Developer ($99/ano) + certificados
npx eas-cli init            # associa o projeto ao EAS
npx eas-cli credentials     # gera/instala certificados iOS

# 3. build de distribuição → gera .ipa
npx eas-cli build -p ios --profile preview --output dist/ios/HR-Hospitality.ipa
```

Perfil `preview` definido em `eas.json` (distribution: internal).

Requisitos:
- Conta Expo (grátis)
- Conta Apple Developer Program ($99/ano) com *In-House/App Store* distribution cert
- `expo.ios.bundleIdentifier` já definido em cada `app.json`

Alternativa local (só macOS com Xcode 16+):
```bash
npx expo prebuild --platform ios
cd ios && xcodebuild -workspace *.xcworkspace -scheme hr-hospitality-mobile \
  -configuration Release -sdk iphoneos archive -archivePath build/App.xcarchive
xcodebuild -exportArchive -archivePath build/App.xcarchive \
  -exportPath build/export -exportOptionsPlist ExportOptions.plist
```
EOF
  echo "  [AVISO] Não foi possível gerar o .ipa a partir desta máquina."
  echo "          Instruções completas escritas em: dist/ios/README-BUILD-IOS.md"
  exit 0
fi

echo "  [3/3] .ipa gerado em $OUT_DIR/HR-Hospitality.ipa"
ls -lh "$OUT_DIR"
