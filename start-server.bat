@echo off
setlocal EnableExtensions
title HR-HOSPITALITY - Servidor Local
cd /d "%~dp0"

echo.
echo   == HR-HOSPITALITY :: Servidor Local (arranque em 1 clique) ==
echo   Pressione qualquer tecla para parar o servidor depois de arrancar.
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo   [ERRO] Node.js nao encontrado neste PC.
    echo          Instale em https://nodejs.org/ LTS e volte a correr este ficheiro.
    pause
    exit /b 1
)

rem --- 1. Configuracao publica ------------------------------------------------
if not exist "hr-hospitality-app\.env.local" (
    copy /y "hr-hospitality-app\.env.example" "hr-hospitality-app\.env.local" >nul
    echo   [OK] Criado hr-hospitality-app\.env.local a partir de .env.example
)

set "HR_SUPA_URL="
for /f "usebackq eol=# tokens=1,* delims==" %%A in ("hr-hospitality-app\.env.local") do (
    if /i "%%A"=="NEXT_PUBLIC_SUPABASE_URL" set "HR_SUPA_URL=%%B"
)
set "HR_HAS_CREDS=0"
if not "%HR_SUPA_URL%"=="" if not "%HR_SUPA_URL%"=="https://SEU-PROJETO.supabase.co" set "HR_HAS_CREDS=1"

if "%HR_HAS_CREDS%"=="1" (
    echo   [OK] Supabase configurado em .env.local - build operacional.
) else (
    echo   [AVISO] Supabase NAO configurado - o painel arranca em MODO DEMONSTRACAO.
    echo           Para modo ligado, edite hr-hospitality-app\.env.local e corre novamente.
)

rem --- 2. Migracoes + seeders da base local -----------------------------------
echo.
echo   [1/5] Migracoes SQLite locais...
call node "hr-hospitality-app\scripts\run_migrations.mjs" --target=sqlite
if errorlevel 1 (
    echo   [ERRO] Falha nas migracoes SQLite.
    pause
    exit /b 1
)

echo   [2/5] Seeders de demonstracao...
call node "hr-hospitality-app\scripts\seed.mjs" --target=sqlite
if errorlevel 1 (
    echo   [ERRO] Falha ao aplicar os seeders.
    pause
    exit /b 1
)

rem --- 3. Migracoes Supabase (apenas com credenciais de BD no ambiente) ------
if "%HR_HAS_CREDS%"=="0" goto :skip_supabase
if "%PGPASSWORD%"=="" goto :skip_supabase
if "%SUPABASE_DB_HOST%"=="" goto :skip_supabase
echo   [3/5] Migracoes Supabase 001..008 + seeders...
call node "hr-hospitality-app\scripts\run_migrations.mjs" --target=supabase
call node "hr-hospitality-app\scripts\seed.mjs" --target=supabase
goto :migrations_done
:skip_supabase
echo   [3/5] Supabase remoto ignorado (sem PGPASSWORD/SUPABASE_DB_HOST no ambiente).
:migrations_done

rem --- 4. Build do frontend ---------------------------------------------------
set "HR_NEED_BUILD=0"
if not exist "hr-hospitality-app\out\index.html" set "HR_NEED_BUILD=1"
if /i "%~1"=="--rebuild" set "HR_NEED_BUILD=1"
if /i "%~1"=="-r" set "HR_NEED_BUILD=1"

if "%HR_NEED_BUILD%"=="0" (
    echo   [4/5] Frontend ja compilado - a reutilizar hr-hospitality-app\out
    echo          Corra "start-server.bat --rebuild" para forcar nova compilacao
    goto :build_done
)

echo   [4/5] A compilar o frontend Next.js...
set "HR_BUILD_RC=0"
pushd hr-hospitality-app >nul
if "%HR_HAS_CREDS%"=="1" (
    call npm run build
) else (
    set "HR_DEMO_BUILD=1"
    call npm run build
)
set "HR_BUILD_RC=%errorlevel%"
popd >nul
if not "%HR_BUILD_RC%"=="0" (
    echo   [ERRO] Build do frontend falhou (codigo %HR_BUILD_RC%).
    pause
    exit /b 1
)
:build_done

rem --- 5. Endereco na rede local ---------------------------------------------
set "HR_IP=127.0.0.1"
for /f "delims=" %%I in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object -First 1).IPAddress"') do set "HR_IP=%%I"
if "%HR_IP%"=="" set "HR_IP=127.0.0.1"
if "%HR_PORT%"=="" set "HR_PORT=3000"

echo.
echo   ============================================================
echo    SERVIDOR A ARRANCAR
echo    Portal          : http://localhost:%HR_PORT%
echo    Na rede local   : http://%HR_IP%:%HR_PORT%
echo    Downloads + QR  : http://%HR_IP%:%HR_PORT%/download/
echo   ============================================================
echo.

if not exist "dist\download" mkdir "dist\download"
if not exist "hr-hospitality-app\scripts\qr.mjs" goto :qr_done
call node "hr-hospitality-app\scripts\qr.mjs" "http://%HR_IP%:%HR_PORT%/download/" --out="dist\download\qr-portal.svg"
if errorlevel 1 echo   [AVISO] QR nao gerado - corra "npm i -D qrcode" em hr-hospitality-app.
:qr_done

echo.
echo   [5/5] A preparar a area de download...
call node "hr-hospitality-app\scripts\stage_downloads.mjs" --ip="%HR_IP%" --port="%HR_PORT%"

set "HOST=0.0.0.0"
set "PORT=%HR_PORT%"
call node "hr-hospitality-app\scripts\serve_static.mjs"
echo.
echo   Servidor terminado.
pause
