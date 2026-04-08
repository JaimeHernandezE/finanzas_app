"""
Django settings for core project.
"""

import os
from datetime import timedelta
from pathlib import Path

import dj_database_url
from corsheaders.defaults import default_headers
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


def _normalizar_database_url(raw: str | None) -> str | None:
    """Quita espacios y comillas típicas al pegar desde el panel de Render u otros hosts."""
    if raw is None:
        return None
    s = raw.strip()
    if not s:
        return None
    if len(s) >= 2 and s[0] == s[-1] and s[0] in "\"'":
        s = s[1:-1].strip()
    return s or None


def _env_flag(name: str, default: str = 'false') -> bool:
    """True si la variable es truthy: True, true, 1, yes, on (Render/GUI suelen variar mayúsculas)."""
    raw = os.environ.get(name, default)
    return str(raw).strip().lower() in ('1', 'true', 'yes', 'on')


def _secret_key_desde_env() -> str:
    """Evita SECRET_KEY vacío: os.getenv('SECRET_KEY','') no cae al default y rompe JWT (p. ej. demo-login → 500)."""
    for nombre in ('SECRET_KEY', 'DJANGO_SECRET_KEY'):
        raw = os.environ.get(nombre)
        if raw is not None and str(raw).strip():
            return str(raw).strip()
    raise ImproperlyConfigured(
        'SECRET_KEY no está configurada. Define la variable de entorno SECRET_KEY '
        'o DJANGO_SECRET_KEY antes de iniciar el servidor.'
    )


SECRET_KEY = _secret_key_desde_env()

DEBUG = os.environ.get('DEBUG', 'False').lower() == 'true'

# Modo demo: sin Firebase Admin en runtime; login vía JWT (demo-login) y datos ficticios.
DEMO = _env_flag('DEMO', 'false')

ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Librerías de terceros
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',

    # Tus apps
    'applications.usuarios',
    'applications.finanzas',
    'applications.inversiones',
    'applications.viajes',
    'applications.export',
    'applications.backup_bd',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'core.wsgi.application'

DATABASE_URL = _normalizar_database_url(os.environ.get('DATABASE_URL'))
if DATABASE_URL:
    try:
        DATABASES = {
            'default': dj_database_url.parse(DATABASE_URL, conn_max_age=600)
        }
    except dj_database_url.ParseError as exc:
        raise ImproperlyConfigured(
            'DATABASE_URL no es una URL válida. Usa la cadena tal cual la copia tu proveedor '
            '(p. ej. Render Internal/External Database URL, Supabase URI en Settings → Database), '
            'sin comillas extra ni espacios al inicio/fin. Si la contraseña incluye @, :, /, #, % '
            'u otros caracteres reservados, debe ir codificada en la URL; mejor pegar desde el panel '
            'del proveedor que armar la URL a mano.'
        ) from exc
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.environ.get('DB_NAME', 'finanzas_db'),
            'USER': os.environ.get('DB_USER', 'admin'),
            'PASSWORD': os.environ.get('DB_PASSWORD', 'password123'),
            'HOST': os.environ.get('DB_HOST', 'localhost'),
            'PORT': '5432',
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'es-CL'
TIME_ZONE = os.environ.get('TIME_ZONE', 'America/Santiago')
USE_I18N = True
USE_L10N = True
USE_TZ = True

# ── MONEDA ────────────────────────────────────────────────────────────────────
# Moneda base de la app. Todos los montos se almacenan en esta moneda.
MONEDA_BASE = os.environ.get('MONEDA_BASE', 'CLP')
MONEDA_SIMBOLO = os.environ.get('MONEDA_SIMBOLO', '$')
MONEDA_SEPARADOR_MILES = os.environ.get('MONEDA_SEPARADOR_MILES', '.')
MONEDA_SEPARADOR_DECIMALES = os.environ.get('MONEDA_SEPARADOR_DECIMALES', ',')
MONEDA_DECIMALES = int(os.environ.get('MONEDA_DECIMALES', '0'))

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Importación de respaldos .sql.gz (admin; hasta 200 MB en la vista)
FILE_UPLOAD_MAX_MEMORY_SIZE = 50 * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = 250 * 1024 * 1024

AUTH_USER_MODEL = 'usuarios.Usuario'

CORS_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        'CORS_ALLOWED_ORIGINS',
        'http://localhost:5173,http://localhost:3000',
    ).split(',')
    if o.strip()
]

# Permitir todos los orígenes solo si se activa explícitamente vía env var (solo desarrollo local).
CORS_ALLOW_ALL_ORIGINS = _env_flag('CORS_ALLOW_ALL_ORIGINS', 'false')

# Cabeceras permitidas en preflight (incl. Authorization para POST con JWT entre orígenes)
CORS_ALLOW_HEADERS = list(default_headers)

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_THROTTLE_CLASSES': [],
    'DEFAULT_THROTTLE_RATES': {
        'demo_login': '10/minute',
    },
}

# En demo: tokens más largos porque no hay refresh automático desde Firebase.
# En producción: tiempos cortos para reducir la ventana si un token es comprometido.
if DEMO:
    SIMPLE_JWT = {
        'ACCESS_TOKEN_LIFETIME': timedelta(hours=8),
        'REFRESH_TOKEN_LIFETIME': timedelta(days=30),
    }
else:
    SIMPLE_JWT = {
        'ACCESS_TOKEN_LIFETIME': timedelta(hours=1),
        'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    }

# ── SEGURIDAD EN PRODUCCIÓN ────────────────────────────────────────────────────
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SECURE_SSL_REDIRECT = os.getenv('SECURE_SSL_REDIRECT', 'True') == 'True'
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True

# Logs en stderr (Gunicorn/Render): tracebacks de 500 visibles en la pestaña Logs del servicio.
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'simple': {
            'format': '{levelname} {asctime} {name} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'simple',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'django.request': {
            'handlers': ['console'],
            'level': 'ERROR',
            'propagate': False,
        },
        'applications.usuarios': {
            'handlers': ['console'],
            'level': 'DEBUG' if DEBUG else 'INFO',
            'propagate': False,
        },
    },
}

# Inicializar Firebase Admin SDK (clave de servicio desde env o archivo local)
from firebase_admin_init import init_firebase
init_firebase()
