# ============================================================
#   Migração das Tabelas de Hospitalidade para SQLite Local
#   Envia cada instrução SQL para o servidor Express (porta 3002)
# ============================================================

$ServerUrl = "http://localhost:3002"
$SqlFile   = Join-Path $PSScriptRoot "HOSPITALITY_LOCAL_SQLITE.sql"

Write-Host "=== HR-HOSPITALITY: Migração SQLite Local ===" -ForegroundColor Cyan
Write-Host "Servidor: $ServerUrl" -ForegroundColor Gray

# Verificar conectividade com o servidor
try {
    $health = Invoke-RestMethod -Uri "$ServerUrl/api/health" -Method Get -TimeoutSec 5
    Write-Host "Servidor local OK: $($health | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
    Write-Host "ERRO: Servidor local nao encontrado na porta 3002." -ForegroundColor Red
    Write-Host "Certifica-te que o HR-GESTPRO-2.0 esta em execucao (Electron ou npm run server)." -ForegroundColor Yellow
    exit 1
}

# Ler o ficheiro SQL e dividir em instruções individuais
$sqlContent = Get-Content -Path $SqlFile -Raw -Encoding UTF8

# Remover comentários de linha (--) e dividir por ';'
$statements = $sqlContent -split ';\s*\n' | ForEach-Object {
    $stmt = $_.Trim()
    # Remover linhas de comentário puras
    $stmt = ($stmt -split '\n' | Where-Object { $_ -notmatch '^\s*--' }) -join "`n"
    $stmt.Trim()
} | Where-Object { $_.Length -gt 3 }

Write-Host "`nA executar $($statements.Count) instrucoes SQL..." -ForegroundColor Yellow

$successCount = 0
$errorCount   = 0

foreach ($stmt in $statements) {
    if ([string]::IsNullOrWhiteSpace($stmt)) { continue }

    $body = @{
        sql    = $stmt
        params = @()
    } | ConvertTo-Json -Depth 3

    try {
        $response = Invoke-RestMethod `
            -Uri     "$ServerUrl/api/db/execute" `
            -Method  Post `
            -Body    $body `
            -ContentType "application/json" `
            -TimeoutSec 10

        $successCount++
        $preview = if ($stmt.Length -gt 60) { $stmt.Substring(0, 60) + "..." } else { $stmt }
        Write-Host "  OK: $preview" -ForegroundColor Green
    } catch {
        $errorCount++
        $preview = if ($stmt.Length -gt 60) { $stmt.Substring(0, 60) + "..." } else { $stmt }
        Write-Host "  AVISO: $preview" -ForegroundColor Yellow
        Write-Host "         $($_.Exception.Message)" -ForegroundColor DarkYellow
    }
}

Write-Host "`n=== Resultado ===" -ForegroundColor Cyan
Write-Host "Sucesso: $successCount instrucoes" -ForegroundColor Green
if ($errorCount -gt 0) {
    Write-Host "Avisos:  $errorCount instrucoes (pode ser normal para CREATE IF NOT EXISTS / ON CONFLICT)" -ForegroundColor Yellow
}

# Verificar dados inseridos
Write-Host "`nA verificar tabelas criadas..." -ForegroundColor Yellow

$tables = @("hotel_rooms", "hotel_reservations", "hotel_consumptions", "sync_queue")
foreach ($table in $tables) {
    $countBody = @{
        sql    = "SELECT COUNT(*) as total FROM $table"
        params = @()
    } | ConvertTo-Json

    try {
        $result = Invoke-RestMethod -Uri "$ServerUrl/api/db/query" -Method Post -Body $countBody -ContentType "application/json" -TimeoutSec 5
        $total = $result.rows[0].total
        Write-Host "  Tabela '$table': $total registos" -ForegroundColor Cyan
    } catch {
        Write-Host "  Tabela '$table': nao encontrada (pode precisar de criacao manual)" -ForegroundColor Red
    }
}

Write-Host "`nMigracao concluida! O HR-HOSPITALITY ja pode usar o SQLite local." -ForegroundColor Green
