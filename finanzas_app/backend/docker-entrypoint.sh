#!/bin/sh
# Antes de Gunicorn: migraciones + datos mínimos (categorías, admin opcional, demo si falta).
# Desactivar: SKIP_MIGRATE_ON_START=1 y/o SKIP_POST_MIGRATE_SETUP=1
set -e
if [ "${SKIP_MIGRATE_ON_START:-0}" != "1" ]; then
  echo "==> docker-entrypoint: migrate"
  python manage.py migrate --noinput
fi
if [ "${SKIP_POST_MIGRATE_SETUP:-0}" != "1" ]; then
  echo "==> docker-entrypoint: seed_categorias"
  python manage.py seed_categorias
  echo "==> docker-entrypoint: crear_admin"
  python manage.py crear_admin
  echo "==> docker-entrypoint: ensure_demo_seed"
  python manage.py ensure_demo_seed
fi
exec "$@"
