#!/usr/bin/env python3
"""
Respaldo diario: pg_dump → Google Drive → conservar solo los 2 archivos más recientes.

Uso (GitHub Actions o local):
  export DATABASE_URL=...
  export GOOGLE_DRIVE_CREDENTIALS_JSON='{"type":"service_account",...}'
  export GOOGLE_DRIVE_BACKUP_FOLDER_ID=...

  python finanzas_app/scripts/backup_pg_to_drive.py

Requiere: postgresql-client (pg_dump), pip: google-api-python-client google-auth
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / 'backend'
sys.path.insert(0, str(BACKEND))

from applications.backup_bd.drive_pg import run_backup_to_drive  # noqa: E402


def main() -> None:
    out = run_backup_to_drive()
    print(out)


if __name__ == '__main__':
    main()
