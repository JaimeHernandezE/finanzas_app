#!/bin/sh
# Antes de Gunicorn: asegura esquema en la BD (Render Docker sin Release Command suele dejar tablas inexistentes).
# Idempotente. Desactivar: SKIP_MIGRATE_ON_START=1
set -e
if [ "${SKIP_MIGRATE_ON_START:-0}" != "1" ]; then
  echo "==> docker-entrypoint: migrate"
  python manage.py migrate --noinput
fi
exec "$@"
