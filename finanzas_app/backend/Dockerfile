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
