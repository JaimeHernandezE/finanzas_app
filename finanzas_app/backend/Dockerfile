FROM python:3.11-slim

# Evitar que Python escriba archivos .pyc y forzar salida estándar (logs)
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

WORKDIR /app

# libpq + cliente PostgreSQL (pg_dump / psql para respaldo BD)
RUN apt-get update && apt-get install -y libpq-dev gcc postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Instalar dependencias de Python
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt \
    && python -c "import googleapiclient.discovery; import google.oauth2.service_account"

COPY . /app/

# WhiteNoise espera STATIC_ROOT en runtime; sin este paso /app/staticfiles/ no existe en imagen Docker.
ENV DJANGO_SETTINGS_MODULE=core.settings
RUN SECRET_KEY=docker-collectstatic-only DEBUG=False FIREBASE_SERVICE_ACCOUNT_JSON='{}' \
    python manage.py collectstatic --noinput

# Render (imagen Docker): sin proceso en primer plano el contenedor sale y el deploy falla.
# En local, docker-compose sobrescribe con `command: python manage.py runserver ...`.
ENV PORT=8000
CMD ["sh", "-c", "exec gunicorn core.wsgi:application --bind 0.0.0.0:${PORT} --workers ${WEB_CONCURRENCY:-1} --timeout 120 --graceful-timeout 30 --access-logfile - --error-logfile -"]
