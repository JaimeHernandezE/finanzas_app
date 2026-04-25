FROM python:3.11-slim

# Evitar que Python escriba archivos .pyc y forzar salida estándar (logs)
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

WORKDIR /app

# libpq + cliente PostgreSQL 18 (pg_dump / psql para respaldo BD).
# pg_dump debe ser igual o más nuevo que el servidor; producción usa PostgreSQL 18.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl gnupg gcc \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
        | gpg --dearmor -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg \
    && . /etc/os-release \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update && apt-get install -y --no-install-recommends \
        libpq-dev postgresql-client-18 \
    && rm -rf /var/lib/apt/lists/*
ENV PG_DUMP=/usr/lib/postgresql/18/bin/pg_dump

# Instalar dependencias de Python
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt \
    && python -c "import googleapiclient.discovery; import google.oauth2.service_account"

COPY . /app/

RUN chmod +x /app/docker-entrypoint.sh /app/release.sh

# WhiteNoise espera STATIC_ROOT en runtime; sin este paso /app/staticfiles/ no existe en imagen Docker.
ENV DJANGO_SETTINGS_MODULE=core.settings
RUN SECRET_KEY=docker-collectstatic-only DEBUG=False FIREBASE_SERVICE_ACCOUNT_JSON='{}' \
    python manage.py collectstatic --noinput

# Render (imagen Docker): sin proceso en primer plano el contenedor sale y el deploy falla.
# En local, docker-compose sobrescribe con `command: python manage.py runserver ...`.
ENV PORT=8000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["sh", "-c", "exec gunicorn core.wsgi:application --bind 0.0.0.0:${PORT} --workers ${WEB_CONCURRENCY:-1} --timeout 120 --graceful-timeout 30 --access-logfile - --error-logfile -"]
