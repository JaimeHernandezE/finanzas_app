#!/usr/bin/env bash
# Ejecutar en Render como «Release Command» (plan sin Shell): aplica migraciones y seeds
# contra la DATABASE_URL del despliegue. Misma lógica DEMO que build.sh.
set -o errexit

echo "==> release.sh: migrate"
python manage.py migrate

echo "==> release.sh: seed_categorias"
python manage.py seed_categorias

echo "==> release.sh: crear_admin"
python manage.py crear_admin

_demo_lc=$(printf '%s' "${DEMO:-}" | tr '[:upper:]' '[:lower:]')
if [ "$_demo_lc" = "true" ] || [ "$_demo_lc" = "1" ] || [ "$_demo_lc" = "yes" ] || [ "$_demo_lc" = "on" ]; then
  echo "==> release.sh: seed_demo (DEMO activo)"
  python manage.py seed_demo
fi

echo "==> release.sh: OK"
