# Ejecuta pytest en el contenedor web (usa test_finanzas_db, no finanzas_db).
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
docker-compose exec -T web pytest @args
