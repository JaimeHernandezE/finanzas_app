# backend/firebase_admin_init.py
import os
from pathlib import Path

import firebase_admin
from firebase_admin import credentials

# Ruta por defecto: mismo directorio que este archivo (raíz del backend)
_DEFAULT_CREDENTIALS_PATH = Path(__file__).resolve().parent / 'firebase-service-account.json'


def _demo_desde_env() -> bool:
    raw = os.environ.get('DEMO', 'false')
    return str(raw).strip().lower() in ('1', 'true', 'yes', 'on')


def init_firebase():
    """
    Inicializa Firebase Admin SDK con la clave de servicio.
    Se llama una sola vez al arrancar Django (desde apps.py o settings.py).
    Si no hay credenciales configuradas, no se inicializa (p. ej. al correr migraciones).
    """
    if _demo_desde_env():
        print('[Firebase] Modo DEMO — Firebase Admin omitido.')
        return
    if firebase_admin._apps:
        return
    service_account_path = os.getenv(
        'FIREBASE_SERVICE_ACCOUNT_PATH',
        str(_DEFAULT_CREDENTIALS_PATH)
    )
    service_account_path = os.path.normpath(service_account_path)
    try:
        if os.path.exists(service_account_path):
            cred = credentials.Certificate(service_account_path)
        else:
            import json
            raw = os.getenv('FIREBASE_SERVICE_ACCOUNT_JSON', '{}')
            if not raw or raw == '{}':
                print(
                    f'[Firebase] No configurado: no se encontró {service_account_path}. '
                    'Coloca el JSON en la raíz del backend o define FIREBASE_SERVICE_ACCOUNT_JSON.'
                )
                return
            service_account_info = json.loads(raw)
            cred = credentials.Certificate(service_account_info)
        firebase_admin.initialize_app(cred)
        print(f'[Firebase] Admin inicializado correctamente con {service_account_path}')
    except Exception as e:
        print(f'[Firebase] No inicializado: {e}')
