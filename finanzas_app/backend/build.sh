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

if [ "${DEMO:-}" = "True" ]; then
  echo "==> build.sh: seed_demo (DEMO=True)"
  python manage.py seed_demo
fi

echo "==> build.sh: OK"
