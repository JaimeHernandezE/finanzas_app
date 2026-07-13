#!/usr/bin/env sh
# Ejecuta pytest en el contenedor web (usa test_finanzas_db, no finanzas_db).
set -e
cd "$(dirname "$0")/.."
exec docker-compose exec -T web pytest "$@"
