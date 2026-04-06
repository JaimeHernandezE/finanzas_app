#!/usr/bin/env bash
set -o errexit

echo "==> build.sh: pip install -r requirements.txt"
pip install -r requirements.txt

echo "==> build.sh: collectstatic"
python manage.py collectstatic --no-input

echo "==> build.sh: migrate"
python manage.py migrate

echo "==> build.sh: seed_categorias"
python manage.py seed_categorias

echo "==> build.sh: crear_admin"
python manage.py crear_admin

# Misma lógica que settings._env_flag: true / True / 1 / yes / on
_demo_lc=$(printf '%s' "${DEMO:-}" | tr '[:upper:]' '[:lower:]')
if [ "$_demo_lc" = "true" ] || [ "$_demo_lc" = "1" ] || [ "$_demo_lc" = "yes" ] || [ "$_demo_lc" = "on" ]; then
  echo "==> build.sh: seed_demo (DEMO activo)"
  python manage.py seed_demo
fi

echo "==> build.sh: OK"
