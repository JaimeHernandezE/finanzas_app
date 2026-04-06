#!/bin/sh
# Antes de Gunicorn: migraciones + setup rápido. Nunca ejecutar seed_demo completo aquí:
# Render hace timeout si el puerto no abre a tiempo (varios minutos de seed_demo).
# Datos demo 15 meses: Release Command ./release.sh o manage.py seed_demo.
# Desactivar: SKIP_MIGRATE_ON_START=1 y/o SKIP_POST_MIGRATE_SETUP=1
set -e
if [ "${SKIP_MIGRATE_ON_START:-0}" != "1" ]; then
  echo "==> docker-entrypoint: migrate"
  python manage.py migrate --noinput
fi
if [ "${SKIP_POST_MIGRATE_SETUP:-0}" != "1" ]; then
  # Demo primero: solo seed_demo_minimal vía ensure_demo_seed (segundos) → login usable al abrir el puerto.
  echo "==> docker-entrypoint: ensure_demo_seed"
  python manage.py ensure_demo_seed
  echo "==> docker-entrypoint: seed_categorias"
  python manage.py seed_categorias
  echo "==> docker-entrypoint: crear_admin"
  python manage.py crear_admin
fi
exec "$@"
