#!/bin/sh
# Antes de Gunicorn: migraciones + setup rápido. seed_demo completo no va en primer plano
# (Render hace timeout del puerto). Plan gratuito: no hay Pre-deploy command en Web Services.
# Con DEMO, seed_demo_if_empty corre en segundo plano si la familia Demo no tiene movimientos.
# Desactivar: SKIP_MIGRATE_ON_START=1 y/o SKIP_POST_MIGRATE_SETUP=1 y/o SKIP_BACKGROUND_DEMO_SEED=1
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
  # Misma regla truthy que settings._env_flag / release.sh
  _demo_lc=$(printf '%s' "${DEMO:-}" | tr '[:upper:]' '[:lower:]')
  if [ "${SKIP_BACKGROUND_DEMO_SEED:-0}" != "1" ] && {
    [ "$_demo_lc" = "true" ] || [ "$_demo_lc" = "1" ] || [ "$_demo_lc" = "yes" ] || [ "$_demo_lc" = "on" ]
  }; then
    echo "==> docker-entrypoint: seed_demo_if_empty (segundo plano; histórico completo si falta)"
    python manage.py seed_demo_if_empty &
  fi
fi
exec "$@"
