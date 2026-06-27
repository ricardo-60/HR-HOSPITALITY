$supabaseUrl = "https://rzelexvouysvkejfwrbf.supabase.co"
$serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6ZWxleHZvdXlzdmtlamZ3cmJmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzg4MTE3OSwiZXhwIjoyMDgzNDU3MTc5fQ.D_-0ZEY1ulgUgRaz4Lh-RH9yhhI6mQiKxh6z7RakNHY"
$projectRef = "rzelexvouysvkejfwrbf"

Write-Host "=============================================" -ForegroundColor Yellow
Write-Host "  HR HOSPITALITY — SUPABASE MIGRATION AGENT" -ForegroundColor Yellow
Write-Host "=============================================" -ForegroundColor Yellow

# Carregar o SQL do ficheiro
$sqlScript = Get-Content -Path ".\MIGRATION_FULL.sql" -Raw

$pgMetaHeaders = @{
    "apikey"        = $serviceRoleKey
    "Authorization" = "Bearer $serviceRoleKey"
    "Content-Type"  = "application/json"
}

$pgMetaBody = [System.Text.Encoding]::UTF8.GetBytes(
    (ConvertTo-Json @{ query = $sqlScript } -Compress)
)

# FASE 1: pg-meta
Write-Host "`n[FASE 1] Tentando endpoint /pg/query..." -ForegroundColor Cyan
try {
    $pgMetaResp = Invoke-RestMethod `
        -Uri "$supabaseUrl/pg/query" `
        -Method POST `
        -Headers $pgMetaHeaders `
        -Body $pgMetaBody `
        -ErrorAction Stop
    Write-Host "OK [pg/query]:" ($pgMetaResp | ConvertTo-Json -Depth 3) -ForegroundColor Green
} catch {
    Write-Host "FALHOU [pg/query]: $($_.ErrorDetails.Message)" -ForegroundColor Red
    
    # FASE 2: Management API
    Write-Host "`n[FASE 2] Tentando Management API..." -ForegroundColor Cyan
    $mgmtHeaders = @{
        "Authorization" = "Bearer $serviceRoleKey"
        "Content-Type"  = "application/json"
    }
    $mgmtBody = [System.Text.Encoding]::UTF8.GetBytes(
        (ConvertTo-Json @{ query = $sqlScript } -Compress)
    )
    try {
        $mgmtResp = Invoke-RestMethod `
            -Uri "https://api.supabase.com/v1/projects/$projectRef/database/query" `
            -Method POST `
            -Headers $mgmtHeaders `
            -Body $mgmtBody `
            -ErrorAction Stop
        Write-Host "OK [Management API]:" ($mgmtResp | ConvertTo-Json -Depth 3) -ForegroundColor Green
    } catch {
        Write-Host "FALHOU [Management API]: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}

# FASE 3: Verificacao final via REST
Write-Host "`n[FASE 3] Verificacao de tabelas via REST API..." -ForegroundColor Cyan
@("tenants", "hotel_rooms", "hospitality_reservations") | ForEach-Object {
    $tbl = $_
    try {
        $restUrl = "$supabaseUrl/rest/v1/$tbl" + "?select=id" + "&limit=1"
        $r = Invoke-RestMethod `
            -Uri $restUrl `
            -Headers @{
                "apikey"        = $serviceRoleKey
                "Authorization" = "Bearer $serviceRoleKey"
            } `
            -Method GET `
            -ErrorAction Stop
        Write-Host "  OK '$tbl' existe — $($r.Count) row(s) no sample" -ForegroundColor Green
    } catch {
        Write-Host "  ERRO '$tbl': $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}

Write-Host "`n=============================================" -ForegroundColor Yellow
Write-Host "  CONCLUIDO" -ForegroundColor Yellow
Write-Host "=============================================" -ForegroundColor Yellow
