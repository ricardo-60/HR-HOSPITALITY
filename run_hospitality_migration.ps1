<#
    HR-HOSPITALITY — wrapper seguro do runner canónico.

    A API antiga /api/db/execute e o ficheiro HOSPITALITY_LOCAL_SQLITE.sql
    foram desativados. Este wrapper não aceita SQL arbitrário.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$DatabasePath
)

$ErrorActionPreference = 'Stop'
$runner = Join-Path $PSScriptRoot 'hr-hospitality-app/scripts/run_migrations.mjs'
if (-not (Test-Path -LiteralPath $runner)) {
    throw "Runner não encontrado: $runner"
}

& node $runner --target=sqlite --db=$DatabasePath --snapshot
if ($LASTEXITCODE -ne 0) {
    throw "A migração SQLite falhou com código $LASTEXITCODE."
}
