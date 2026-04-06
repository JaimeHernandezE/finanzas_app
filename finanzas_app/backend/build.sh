#!/usr/bin/env bash
set -o errexit

echo "==> build.sh: pip install -r requirements.txt"
pip install -r requirements.txt

echo "==> build.sh: collectstatic"
python manage.py collectstatic --no-input

echo "==> build.sh: release.sh (migrate + seeds; duplicado con Release Command es inocuo)"
./release.sh

echo "==> build.sh: OK"
