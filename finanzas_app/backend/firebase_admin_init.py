# backend/firebase_admin_init.py
import os
import firebase_admin
from firebase_admin import credentials


def init_firebase():
    """
    Inicializa Firebase Admin SDK con la clave de servicio.
    Se llama una sola vez al arrancar Django (desde apps.py o settings.py).
    Si no hay credenciales configuradas, no se inicializa (p. ej. al correr migraciones).
    """
    if firebase_admin._apps:
        return
    service_account_path = os.getenv(
        'FIREBASE_SERVICE_ACCOUNT_PATH',
        'firebase-service-account.json'
    )
    try:
        if os.path.exists(service_account_path):
            cred = credentials.Certificate(service_account_path)
        else:
            import json
            raw = os.getenv('FIREBASE_SERVICE_ACCOUNT_JSON', '{}')
            if not raw or raw == '{}':
                import logging
                logging.getLogger(__name__).warning(
                    'Firebase no configurado: falta firebase-service-account.json o FIREBASE_SERVICE_ACCOUNT_JSON'
                )
                return
            service_account_info = json.loads(raw)
            cred = credentials.Certificate(service_account_info)
        firebase_admin.initialize_app(cred)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning('Firebase Admin no inicializado: %s', e)
