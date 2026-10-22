$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (-not (Test-Path -LiteralPath '.env')) {
    $localPassword = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
    Set-Content -LiteralPath '.env' -Value "POSTGRES_PASSWORD=$localPassword"
} else {
    $passwordLine = Get-Content -LiteralPath '.env' | Where-Object { $_ -match '^POSTGRES_PASSWORD=' } | Select-Object -First 1
    if (-not $passwordLine) { throw 'Set POSTGRES_PASSWORD in the root .env before continuing.' }
    $localPassword = $passwordLine.Substring('POSTGRES_PASSWORD='.Length)
}
if (-not (Test-Path -LiteralPath 'apps/api/.env')) {
    $localSecret = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
    Set-Content -LiteralPath 'apps/api/.env' -Value "DATABASE_URL=postgresql://miniledger:${localPassword}@localhost:55434/miniledger`nJWT_SECRET=$localSecret`nPORT=3000`nUPLOAD_DIR=uploads`nMOCK_OTP=true"
}
if (-not (Test-Path -LiteralPath 'apps/api/.env.test')) {
    $testSecret = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
    Set-Content -LiteralPath 'apps/api/.env.test' -Value "DATABASE_URL=postgresql://miniledger:${localPassword}@localhost:55434/miniledger_test`nJWT_SECRET=$testSecret`nMOCK_OTP=true"
}
if (-not (Test-Path -LiteralPath 'apps/mobile/.env')) { Copy-Item -LiteralPath 'apps/mobile/.env.example' -Destination 'apps/mobile/.env' }
Write-Host 'Local configuration is ready. Existing files were preserved; credentials were not printed.'
