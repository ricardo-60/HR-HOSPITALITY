@echo off
setlocal EnableExtensions
title HR-HOSPITALITY - Build iOS
cd /d "%~dp0"

echo.
echo   == HR-HOSPITALITY :: Build iOS ==
echo.
echo   [IMPORTANTE] Um .ipa NAO pode ser compilado em Windows: o toolchain
echo   iOS (Xcode) so existe em macOS. As duas vias possiveis sao:
echo.
echo     A) Nuvem - Expo EAS (funciona em Windows)
echo          npx eas-cli login
echo          npx eas-cli build -p ios --profile preview --non-interactive --no-wait --output dist\ios\HR-Hospitality.ipa
echo        Requer conta Expo (gratis) + conta Apple Developer (99 USD/ano).
echo.
echo     B) Local - apenas em macOS com Xcode 16+
echo          npx expo prebuild --platform ios
echo.
echo   O perfil "preview" ja esta definido em eas.json das 3 apps.
echo   Instrucoes passo-a-passo: docs\BUILD_IOS.md
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo   [ERRO] Node.js nao encontrado.
    pause
    exit /b 1
)

if not exist "dist\ios" mkdir "dist\ios"

echo   [1/2] A verificar o EAS CLI...
call npx --yes eas-cli --version
if errorlevel 1 (
    echo   [ERRO] eas-cli indisponivel (verifique a rede).
    pause
    exit /b 1
)

echo.
echo   [2/2] A iniciar o build na nuvem (EAS)...
echo         (abre o browser para autenticacao, se ainda nao estiver logado)
call npx --yes eas-cli build -p ios --profile preview --non-interactive --no-wait --output "dist\ios\HR-Hospitality.ipa"
if errorlevel 1 goto :fallback

echo.
echo   OK Build iOS submetido. O .ipa aparecera em dist\ios\ quando terminar.
goto :end

:fallback
echo.
echo   [AVISO] Nao foi possivel submeter o build a partir desta maquina.
echo           Siga as instrucoes em docs\BUILD_IOS.md e tente novamente.
if not exist "dist\ios\README-BUILD-IOS.md" (
    echo   Instrucoes: docs\BUILD_IOS.md
)

:end
echo.
pause
