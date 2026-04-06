#!/usr/bin/env bash
set -o errexit

pip install -r requirements.txt
python manage.py collectstatic --no-input
python manage.py migrate
python manage.py seed_categorias
python manage.py crear_admin

if [ "${DEMO:-}" = "True" ]; then
  echo "Modo DEMO: recreando datos de demostración..."
  python manage.py seed_demo
fi
