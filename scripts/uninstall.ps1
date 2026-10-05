<#
.SYNOPSIS
    HR-HOSPITALITY — Clean Uninstall Script
    Desinstala completamente a versão anterior preservando dados sensíveis.

.DESCRIPTION
    1. Encerra processos ativos (Cliente, Servidor, Node/Electron)
    2. Executa desinstalação silenciosa via NSIS (uninst.exe /S)
    3. Preserva: SQLite DB, tokens, logs essenciais
    4. Remove: bundles .asar, pacotes obsoletos, ficheiros temporários

.NOTES
    Autor: HR-TECNOLOGIA
    Versão: 1.0
#>

param(
    [switch]$Force,
    [switch]$KeepData
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  HR-HOSPITALITY — CLEAN UNINSTALL v1.0                       ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ─── 1. FECHO DE PROCESSOS ──────────────────────────────────────────────────
Write-Host "▶  1/5  A encerrar processos ativos..." -ForegroundColor Yellow

$processNames = @(
    'HR Hospitality Cliente',
    'HR Hospitality Servidor',
    'electron',
    'node'
)

foreach ($name in $processNames) {
    $procs = Get-Process -Name $name -ErrorAction SilentlyContinue
    if ($procs) {
        $procs | ForEach-Object {
            Write-Host "   • A encerrar: $($_.Name) (PID $($_.Id))" -ForegroundColor Gray
            try { $_ | Stop-Process -Force -ErrorAction Stop }
            catch { Write-Warning "   ! Falha ao encerrar $($_.Name) (PID $($_.Id)): $($_.Exception.Message)" }
        }
    }
}
Start-Sleep -Seconds 3

# Verificar se ainda existem
$remaining = Get-Process -Name 'HR Hospitality Cliente', 'HR Hospitality Servidor' -ErrorAction SilentlyContinue
if ($remaining) {
    Write-Warning "   ! Processos remanescentes: $($remaining.Name -join ', ') — a forçar término..."
    $remaining | Stop-Process -Force
    Start-Sleep -Seconds 2
}
Write-Host "   ✔ Processos encerrados." -ForegroundColor Green

# ─── 2. DESINSTALAÇÃO SILENCIOSA VIA NSIS ──────────────────────────────────
Write-Host "`n▶  2/5  A executar desinstalação silenciosa (NSIS)..." -ForegroundColor Yellow

$uninstallPaths = @(
    "${env:LOCALAPPDATA}\Programs\HR Hospitality Cliente\uninstall\uninst.exe",
    "${env:LOCALAPPDATA}\Programs\HR Hospitality Servidor\uninstall\uninst.exe"
)

foreach ($uninstPath in $uninstallPaths) {
    if (Test-Path $uninstPath) {
        $productName = Split-Path (Split-Path $uninstPath -Parent) -Leaf
        Write-Host "   • A desinstalar: $productName..." -ForegroundColor Gray
        try {
            $proc = Start-Process -FilePath $uninstPath -ArgumentList '/S' -Wait -PassThru -ErrorAction Stop
            if ($proc.ExitCode -eq 0) {
                Write-Host "   ✔ $productName desinstalado (exit code 0)" -ForegroundColor Green
            } else {
                Write-Warning "   ! $productName: exit code $($proc.ExitCode)"
            }
        } catch {
            Write-Error "   ✖ Falha ao executar $uninstPath: $($_.Exception.Message)"
        }
    } else {
        Write-Host "   • $productName: uninst.exe não encontrado (pode já estar removido)" -ForegroundColor Gray
    }
}

Start-Sleep -Seconds 3

# ─── 3. REMOÇÃO DE DIRECTÓRIOS DE INSTALAÇÃO ───────────────────────────────
Write-Host "`n▶  3/5  A remover directórios de instalação obsoletos..." -ForegroundColor Yellow

$installDirs = @(
    "${env:LOCALAPPDATA}\Programs\HR Hospitality Cliente",
    "${env:LOCALAPPDATA}\Programs\HR Hospitality Servidor"
)

foreach ($dir in $installDirs) {
    if (Test-Path $dir) {
        try {
            Remove-Item -Path $dir -Recurse -Force -ErrorAction Stop
            Write-Host "   ✔ Removido: $dir" -ForegroundColor Green
        } catch {
            Write-Warning "   ! Falha ao remover $dir: $($_.Exception.Message)"
        }
    }
}

# ─── 4. LIMPEZA DE FICHEIROS TEMPORÁRIOS E CACHE (PRESERVANDO DADOS) ───────
Write-Host "`n▶  4/5  A limpar ficheiros temporários e cache (preservando dados sensíveis)..." -ForegroundColor Yellow

# Directórios a LIMPAR (cache, temp, asar antigo, build artifacts)
$cleanPaths = @(
    "${env:TEMP}\hr-hospitality-*",
    "${env:LOCALAPPDATA}\Temp\hr-hospitality-*",
    "${env:LOCALAPPDATA}\HR-Hospitality\Cache",
    "${env:LOCALAPPDATA}\HR-Hospitality\GPUCache",
    "${env:LOCALAPPDATA}\HR-Hospitality\ShaderCache",
    "${env:LOCALAPPDATA}\HR-Hospitality\DawnCache",
    "${env:LOCALAPPDATA}\HR-Hospitality\DawnGraphiteCache",
    "${env:APPDATA}\hr-hospitality-app\logs\*.log",
    "${env:APPDATA}\hr-hospitality-app\scripts\shots\*.png"
)

# Ficheiros/Directórios a PRESERVAR (NÃO tocar)
$preservePaths = @(
    "${env:APPDATA}\hr-hospitality-app\hospitality_local.db",
    "${env:APPDATA}\hr-hospitality-app\sessions",
    "${env:APPDATA}\hr-hospitality-app\logs\audit_*.csv",
    "${env:APPDATA}\hr-hospitality-app\config"
)

foreach ($pattern in $cleanPaths) {
    $items = Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue
    foreach ($item in $items) {
        $fullPath = $item.FullName
        $shouldPreserve = $false
        foreach ($preserve in $preservePaths) {
            if ($fullPath -like $preserve) { $shouldPreserve = $true; break }
        }
        if (-not $shouldPreserve) {
            try {
                Remove-Item -Path $fullPath -Recurse -Force -ErrorAction Stop
                Write-Host "   🗑  Removido: $fullPath" -ForegroundColor DarkGray
            } catch { }
        }
    }
}
Write-Host "   ✔ Limpeza de temporários concluída." -ForegroundColor Green

# ─── 5. VERIFICAÇÃO FINAL ──────────────────────────────────────────────────
Write-Host "`n▶  5/5  Verificação final..." -ForegroundColor Yellow

$checks = @(
    @{ Path = "${env:LOCALAPPDATA}\Programs\HR Hospitality Cliente"; ShouldExist = $false; Label = "Directório Cliente" },
    @{ Path = "${env:LOCALAPPDATA}\Programs\HR Hospitality Servidor"; ShouldExist = $false; Label = "Directório Servidor" },
    @{ Path = "${env:APPDATA}\hr-hospitality-app\hospitality_local.db"; ShouldExist = $true; Label = "SQLite DB (preservado)" },
    @{ Path = "${env:APPDATA}\hr-hospitality-app\sessions"; ShouldExist = $true; Label = "Tokens/Sessões (preservados)" },
    @{ Path = "${env:APPDATA}\hr-hospitality-app\logs"; ShouldExist = $true; Label = "Directório Logs (preservado)" }
)

$allOk = $true
foreach ($check in $checks) {
    $exists = Test-Path $check.Path
    if ($exists -eq $check.ShouldExist) {
        Write-Host "   ✔ $($check.Label): $([string]::Format('{0}', $exists))" -ForegroundColor Green
    } else {
        Write-Host "   ✖ $($check.Label): Esperado $($check.ShouldExist), encontrado $exists" -ForegroundColor Red
        $allOk = $false
    }
}

Write-Host "`n" + ("═" * 60) -ForegroundColor Cyan
if ($allOk) {
    Write-Host "✅  DESINSTALAÇÃO LIMPA CONCLUÍDA COM SUCESSO!" -ForegroundColor Green
    Write-Host "   Dados sensíveis preservados. Sistema pronto para nova instalação." -ForegroundColor Gray
} else {
    Write-Host "⚠  DESINSTALAÇÃO CONCLUÍDA COM AVISOS." -ForegroundColor Yellow
    Write-Host "   Verifique os itens marcados com ✖ acima." -ForegroundColor Gray
}
Write-Host ("═" * 60) -ForegroundColor Cyan

exit ($allOk ? 0 : 1)