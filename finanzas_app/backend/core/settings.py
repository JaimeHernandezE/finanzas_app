"""
Django settings for core project.
"""

import os
import dj_database_url
from pathlib import Path

from corsheaders.defaults import default_headers

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get('SECRET_KEY', os.environ.get('DJANGO_SECRET_KEY', 'django-insecure-change-me-in-production'))

DEBUG = os.environ.get('DEBUG', 'True').lower() == 'true'

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

DATABASE_URL = os.environ.get('DATABASE_URL')
if DATABASE_URL:
    DATABASES = {
        'default': dj_database_url.parse(DATABASE_URL, conn_max_age=600)
    }
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

AUTH_USER_MODEL = 'usuarios.Usuario'

CORS_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        'CORS_ALLOWED_ORIGINS',
        'http://localhost:5173,http://localhost:3000',
    ).split(',')
    if o.strip()
]

# En desarrollo, permite todos los orígenes si DEBUG está activo
CORS_ALLOW_ALL_ORIGINS = DEBUG

# Cabeceras permitidas en preflight (incl. Authorization para POST con JWT entre orígenes)
CORS_ALLOW_HEADERS = list(default_headers)

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
}

# ── SEGURIDAD EN PRODUCCIÓN ────────────────────────────────────────────────────
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True

# Inicializar Firebase Admin SDK (clave de servicio desde env o archivo local)
from firebase_admin_init import init_firebase
init_firebase()
