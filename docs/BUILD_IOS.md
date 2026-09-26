# iOS — gerar o `.ipa` para a demonstração

> Estado nesta máquina (Windows): **o `.ipa` não pode ser compilado localmente**.
> O toolchain iOS (Xcode) só existe em macOS. Tudo o que é *pré-requisito*
> (`eas.json`, `bundleIdentifier`, scripts, pastas de saída) já está pronto;
> falta apenas executar um dos dois caminhos abaixo.

## Pré-requisitos já entregues

| Item | Estado |
| --- | --- |
| `eas.json` nas 3 apps (perfis `development` / `preview` / `production`) | ✅ `hr-hospitality-mobile/eas.json`, `hr-hospitality-pos/eas.json`, `hr-hospitality-executive/eas.json` |
| `ios.bundleIdentifier` | ✅ `ao.hotel.lukweku`, `ao.hotel.lukweku.pos`, `ao.hotel.lukweku.gestao` |
| `ios.icon` / `ITSAppUsesNonExemptEncryption` | ✅ definido no `app.json` |
| Script de build | ✅ `build-ios.bat` (Windows) · `build-ios.sh` (macOS/Linux) |
| Pasta de saída | ✅ `dist/ios/` |

## Via A — nuvem (Expo EAS) · funciona a partir do Windows

```bash
# 1. autenticar (conta Expo gratuita)
npx eas-cli login

# 2. associar o projeto e criar certificados Apple (uma única vez)
npx eas-cli init
npx eas-cli credentials        # gera/instala o Distribution Certificate iOS

# 3. build de distribuição → .ipa
npx eas-cli build -p ios --profile preview --non-interactive --no-wait \
      --output dist/ios/HR-Hospitality.ipa
```

Ou, em Windows, simplesmente:

```bat
build-ios.bat
```

**Custos / contas necessárias**

| Conta | Custo | Para quê |
| --- | --- | --- |
| Expo | grátis | correr builds EAS |
| Apple Developer Program | 99 USD/ano | assinar o `.ipa` e instalar em dispositivos reais |

Sem a conta Apple não existe `.ipa` — não há atalho.

## Via B — local · só macOS com Xcode 16+

```bash
npx expo prebuild --platform ios
cd ios
xcodebuild -workspace *.xcworkspace -scheme hr-hospitality-mobile \
  -configuration Release -sdk iphoneos \
  -archivePath build/App.xcarchive archive
xcodebuild -exportArchive -archivePath build/App.xcarchive \
  -exportPath build/export -exportOptionsPlist ExportOptions.plist
cp build/export/*.ipa ../../dist/ios/
```

Para o **simulador** (não instala em telemóveis reais):

```bash
./build-ios.sh simulator
```

## O que muda depois de o `.ipa` existir

1. Copie-o para `dist/ios/`.
2. Corra `./start-server.sh` (ou `start-server.bat`) — o `stage_downloads.mjs`
   apanha automaticamente `dist/ios/*.ipa` e publica-o em
   `http://<ip-da-lan>:3000/download/ios/` com QR code.
3. Distribuição a partir do telemóvel requer **TestFlight** ou um link
   enterprise/ad-hoc; um `.ipa` não instala por "abrir no telemóvel".

## Referência rápida dos perfis (`eas.json`)

| Perfil | Plataformas | Uso |
| --- | --- | --- |
| `development` | Android APK + iOS dev client | desenvolvimento com Metro |
| `preview` | Android APK + iOS `.ipa` interno | **demonstração / distribuição interna** |
| `production` | AAB + App Store | loja |

Todos os perfis exportam `HR_BUILD_PROFILE` para o bundle.
