# ============================================================
#  HR-HOSPITALITY - Build de APKs Android (modo demo / local)
# ============================================================
#  Gera, a partir das 3 apps Expo:
#      dist/android/hr-client-app.apk
#      dist/android/hr-pos-app.apk
#      dist/android/hr-executive-app.apk
#
#  Uso (PowerShell, a partir da raiz do repositorio):
#      powershell -ExecutionPolicy Bypass -File .\build-android.ps1
#      powershell -ExecutionPolicy Bypass -File .\build-android.ps1 -Apps mobile,pos
#      powershell -ExecutionPolicy Bypass -File .\build-android.ps1 -Clean
#
#  Credenciais: le NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY de
#  hr-hospitality-app/.env.local e converte-as em EXPO_PUBLIC_SUPABASE_* para o
#  build. Se nao existirem, as apps sao geradas em MODO DEMONSTRACAO.
#  (As variaveis EXPO_PUBLIC_* sao embutidas no bundle - nunca coloque aqui a
#   SERVICE_ROLE_KEY.)
# ============================================================

param(
    [string]$Apps = 'mobile,pos,executive',
    [switch]$SkipPrebuild,
    [switch]$Clean
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

# Executa comandos nativos sem converter stderr em erro terminal
# (o PowerShell 5.1 transforma a saida de erro nativa em NativeCommandError
#  quando $ErrorActionPreference = 'Stop'). Devolve sempre o exit code.
#  -Capture: guarda a saida e mostra-a no fim (usado para comandos que
#            redirecionam para ficheiro). Sem -Capture mostra tudo em direto.
function Invoke-Native {
    param([scriptBlock]$Block, [switch]$Capture)
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        if ($Capture) {
            $lines = & $Block
            $code = $LASTEXITCODE
            foreach ($line in $lines) { if ($null -ne $line) { Write-Host $line } }
        } else {
            # Out-Host mantem a saida fora do pipeline da funcao: sem isto o
            # valor de retorno seria um array (linhas + exit code) e qualquer
            # comparacao `$code -ne 0` daria falso-positivo.
            & $Block | Out-Host
            $code = $LASTEXITCODE
        }
        return $code
    } finally {
        $ErrorActionPreference = $previous
    }
}

$SdkRoot = $env:ANDROID_HOME
if (-not $SdkRoot) { $SdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (-not (Test-Path $SdkRoot)) { throw "Android SDK nao encontrado (esperado em $SdkRoot)." }
$env:ANDROID_HOME = $SdkRoot
$env:ANDROID_SDK_ROOT = $SdkRoot

if (-not $env:JAVA_HOME) {
    $jdk = Get-ChildItem 'C:\Program Files\Eclipse Adoptium' -Directory -ErrorAction SilentlyContinue |
           Sort-Object Name -Descending | Select-Object -First 1
    if ($jdk) { $env:JAVA_HOME = $jdk.FullName }
}
if (-not $env:JAVA_HOME) { throw 'JAVA_HOME nao definido e nao foi encontrado um JDK Temurin.' }

Write-Host ''
Write-Host '  == HR-HOSPITALITY :: Build Android ==' -ForegroundColor Cyan
Write-Host "  SDK   : $SdkRoot"
Write-Host "  JAVA  : $env:JAVA_HOME"
Write-Host "  Apps  : $Apps"

# --- 1. Credenciais publicas (opcional) -------------------------------------
$SupabaseUrl = ''
$SupabaseAnon = ''
$envFile = Join-Path $Root 'hr-hospitality-app\.env.local'
if (Test-Path $envFile) {
    foreach ($line in (Get-Content $envFile)) {
        if ($line -match '^\s*NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.+)$')       { $SupabaseUrl  = $Matches[1].Trim().Trim("'`"") }
        if ($line -match '^\s*NEXT_PUBLIC_SUPABASE_ANON_KEY\s*=\s*(.+)$') { $SupabaseAnon = $Matches[1].Trim().Trim("'`"") }
    }
}
$hasCreds = $SupabaseUrl -and $SupabaseAnon -and ($SupabaseUrl -notlike '*SEU-PROJETO*')
if ($hasCreds) {
    Write-Host "  Supabase: $SupabaseUrl (modo ligado)" -ForegroundColor Green
} else {
    Write-Host '  Supabase: NAO CONFIGURADO - apps geradas em MODO DEMONSTRACAO' -ForegroundColor Yellow
    Write-Host '            (preencha hr-hospitality-app/.env.local e volte a correr).'
}

# --- 2. Keystore de demonstracao --------------------------------------------
$KeysDir = Join-Path $Root 'dist\keys'
$Keystore = Join-Path $KeysDir 'hr-demo-release.keystore'
$PropsFile = Join-Path $KeysDir 'keystore.properties'
if (-not (Test-Path $KeysDir)) { New-Item -ItemType Directory -Path $KeysDir -Force | Out-Null }

if (-not (Test-Path $Keystore)) {
    Write-Host '  -> A gerar keystore de demonstracao...'
    $alias = 'hrdemo'
    $pw = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
    $dname = 'CN=HRHospitalityDemo,OU=Demo,O=HRHospitality'
    $keyLog = Join-Path $KeysDir 'keytool.log'
    $code = Invoke-Native {
        & keytool.exe -genkeypair -v -keystore $Keystore -alias $alias -keyalg RSA -keysize 2048 `
            -validity 10950 -storepass $pw -keypass $pw -dname $dname > $keyLog 2>&1
    }
    if (-not (Test-Path $Keystore)) {
        Write-Host '  Saida do keytool (exit ' + $code + '):' -ForegroundColor Red
        if (Test-Path $keyLog) { Get-Content $keyLog | ForEach-Object { Write-Host "    $_" } }
        throw 'Falha ao gerar o keystore.'
    }
    Remove-Item $keyLog -Force -ErrorAction SilentlyContinue
    @(
        "storeFile=$Keystore",
        "storePassword=$pw",
        "keyAlias=$alias",
        "keyPassword=$pw"
    ) | Set-Content -Path $PropsFile -Encoding ascii
    Write-Host "  OK Keystore: $Keystore" -ForegroundColor Green
    Write-Host '    (keystore e password ficam em dist/keys/, fora do Git)'
} else {
    Write-Host '  OK Keystore de demonstracao ja existe.'
}

$btRoot = Join-Path $SdkRoot 'build-tools'
$btDir = (Get-ChildItem $btRoot -Directory | Sort-Object Name -Descending | Select-Object -First 1).FullName
$apksigner = Join-Path $btDir 'apksigner.bat'
if (-not (Test-Path $apksigner)) { $apksigner = Join-Path $btDir 'bin\apksigner.bat' }
if (-not (Test-Path $apksigner)) { throw "apksigner nao encontrado em $btDir" }

# --- 3. Mapa app -> APK de saida --------------------------------------------
$map = [ordered]@{
    'mobile'    = @{ dir = 'hr-hospitality-mobile';    out = 'hr-client-app.apk' }
    'pos'       = @{ dir = 'hr-hospitality-pos';       out = 'hr-pos-app.apk' }
    'executive' = @{ dir = 'hr-hospitality-executive'; out = 'hr-executive-app.apk' }
}

$OutDir = Join-Path $Root 'dist\android'
if ($Clean -and (Test-Path $OutDir)) { Remove-Item $OutDir -Recurse -Force }
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

$selected = $Apps.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ }
$failures = @()

foreach ($key in $selected) {
    if (-not $map.Contains($key)) {
        Write-Host "  XX App desconhecida: $key" -ForegroundColor Red
        continue
    }
    $entry = $map[$key]
    $dir = Join-Path $Root $entry.dir
    Write-Host ''
    Write-Host ("  == [{0}] {1} -> {2} ==" -f $key, $entry.dir, $entry.out) -ForegroundColor Cyan

    Push-Location $dir
    try {
        if ($hasCreds) {
            @(
                "EXPO_PUBLIC_SUPABASE_URL=$SupabaseUrl",
                "EXPO_PUBLIC_SUPABASE_ANON_KEY=$SupabaseAnon"
            ) | Set-Content -Path '.env' -Encoding utf8
            Write-Host '  -> .env escrito com credenciais publicas.'
        } else {
            if (Test-Path '.env') { Remove-Item '.env' -Force }
            Write-Host '  -> sem .env (modo demonstracao).'
        }

        if ($Clean -and (Test-Path 'android')) { Remove-Item 'android' -Recurse -Force }

        if (-not ((Test-Path 'android') -and $SkipPrebuild)) {
            Write-Host '  -> expo prebuild --platform android ...'
            $code = Invoke-Native { & npx.cmd expo prebuild --platform android --no-install }
            if ($code -ne 0) { throw 'expo prebuild falhou' }
        }

        $sdkDirEscaped = $SdkRoot -replace '\\', '\\'
        "sdk.dir=$sdkDirEscaped" | Set-Content -Path (Join-Path 'android' 'local.properties') -Encoding ascii

        $gradleProps = Join-Path 'android' 'gradle.properties'
        $props = @()
        if (Test-Path $gradleProps) { $props = @(Get-Content $gradleProps) }
        $props = @($props | Where-Object { $_ -notmatch '^(org\.gradle\.jvmargs|android\.useAndroidX|android\.enableJetifier)' })
        $props += 'org.gradle.jvmargs=-Xmx3072m -XX:MaxMetaspaceSize=1024m'
        $props += 'android.useAndroidX=true'
        $props += 'android.enableJetifier=true'
        $props | Set-Content -Path $gradleProps -Encoding ascii

        Write-Host '  -> gradle :app:assembleRelease (a 1a execucao demora varios minutos)...'
        Push-Location 'android'
        try {
            $code = Invoke-Native { & .\gradlew.bat :app:assembleRelease --no-daemon --console=plain }
            if ($code -ne 0) { throw 'gradle assembleRelease falhou' }
        } finally {
            Pop-Location
        }

        $outApkDir = Join-Path 'android' 'app\build\outputs\apk\release'
        $built = $null
        if (Test-Path $outApkDir) {
            $built = Get-ChildItem -Path $outApkDir -Filter '*.apk' |
                     Sort-Object LastWriteTime -Descending | Select-Object -First 1
        }
        if (-not $built) { throw 'APK de release nao encontrado' }

        $target = Join-Path $OutDir $entry.out
        if (Test-Path $target) { Remove-Item $target -Force }
        Copy-Item $built.FullName $target -Force

        Write-Host ("  -> assinar {0}..." -f $entry.out)
        $kspass = ((Get-Content $PropsFile | Where-Object { $_ -like 'storePassword=*' }) -replace '^storePassword=', '')
        $kppass = ((Get-Content $PropsFile | Where-Object { $_ -like 'keyPassword=*' }) -replace '^keyPassword=', '')
        $kalias = ((Get-Content $PropsFile | Where-Object { $_ -like 'keyAlias=*' }) -replace '^keyAlias=', '')

        $signLog = Join-Path $OutDir ('sign-' + $entry.out + '.log')
        $code = Invoke-Native {
            & cmd /c "`"$apksigner`" sign --ks `"$Keystore`" --ks-key-alias $kalias --ks-pass pass:$kspass --key-pass pass:$kppass `"$target`" > `"$signLog`" 2>&1"
        }
        if ($code -ne 0) {
            Write-Host '  Saida do apksigner:' -ForegroundColor Red
            if (Test-Path $signLog) { Get-Content $signLog | ForEach-Object { Write-Host "    $_" } }
            throw 'apksigner falhou'
        }
        $code = Invoke-Native { & cmd /c "`"$apksigner`" verify --verbose `"$target`" > `"$signLog`" 2>&1" }
        if ($code -ne 0) { throw 'verificacao do APK falhou' }
        Remove-Item $signLog -Force -ErrorAction SilentlyContinue

        $size = [math]::Round((Get-Item $target).Length / 1MB, 1)
        Write-Host ("  OK {0} - {1} MB" -f $entry.out, $size) -ForegroundColor Green
    } catch {
        Write-Host ("  XX [{0}] FALHOU: {1}" -f $key, $_.Exception.Message) -ForegroundColor Red
        $failures += $key
    } finally {
        Pop-Location
    }
}

Write-Host ''
Write-Host '  == Resultado ==' -ForegroundColor Cyan
Get-ChildItem $OutDir -Filter '*.apk' -ErrorAction SilentlyContinue |
    ForEach-Object { Write-Host ("    {0,-24} {1,8} MB  {2}" -f $_.Name, [math]::Round($_.Length / 1MB, 1), $_.FullName) }
if ($failures.Count) {
    Write-Host ("  XX Falharam: {0}" -f ($failures -join ', ')) -ForegroundColor Red
    exit 1
}
Write-Host '  OK Build Android concluido.' -ForegroundColor Green
