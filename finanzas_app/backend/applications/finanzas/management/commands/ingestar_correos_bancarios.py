"""
Ingiere correos bancarios desde IMAP y crea MovimientoPendiente.

Uso:
  python manage.py ingestar_correos_bancarios
  python manage.py ingestar_correos_bancarios --dry-run
  python manage.py ingestar_correos_bancarios --usuario-id=1

Variables: CAPTURA_EMAIL_IMAP_* y CAPTURA_EMAIL_USUARIO_ID (o --usuario-id).
"""

from __future__ import annotations

import email
import hashlib
import imaplib
from email.header import decode_header
from email.utils import parseaddr

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from applications.espacios.services import (
    crear_espacio_personal,
    obtener_espacio_familiar_activo,
    obtener_espacio_personal,
)
from applications.finanzas.models import MetodoPago, MovimientoPendiente
from applications.finanzas.services.captura import (
    crear_pendiente,
    resolver_tarjeta_por_ultimos_4,
)
from applications.finanzas.services.captura.parsers import parse_email
from applications.usuarios.models import Usuario


def _decode_mime(value: str | bytes | None) -> str:
    if value is None:
        return ''
    if isinstance(value, bytes):
        parts = decode_header(value.decode('utf-8', errors='replace'))
    else:
        parts = decode_header(value)
    out = []
    for chunk, enc in parts:
        if isinstance(chunk, bytes):
            out.append(chunk.decode(enc or 'utf-8', errors='replace'))
        else:
            out.append(chunk)
    return ''.join(out)


def _body_text(msg: email.message.Message) -> str:
    if msg.is_multipart():
        chunks = []
        for part in msg.walk():
            ctype = part.get_content_type()
            if ctype == 'text/plain':
                payload = part.get_payload(decode=True) or b''
                charset = part.get_content_charset() or 'utf-8'
                chunks.append(payload.decode(charset, errors='replace'))
        return '\n'.join(chunks)
    payload = msg.get_payload(decode=True) or b''
    charset = msg.get_content_charset() or 'utf-8'
    return payload.decode(charset, errors='replace')


class Command(BaseCommand):
    help = 'Ingiere alertas bancarias por IMAP y crea movimientos pendientes.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument('--usuario-id', type=int, default=None)
        parser.add_argument('--limit', type=int, default=50)

    def handle(self, *args, **options):
        host = settings.CAPTURA_EMAIL_IMAP_HOST
        user = settings.CAPTURA_EMAIL_IMAP_USER
        password = settings.CAPTURA_EMAIL_IMAP_PASSWORD
        folder = settings.CAPTURA_EMAIL_IMAP_FOLDER
        if not host or not user or not password:
            raise CommandError(
                'Configura CAPTURA_EMAIL_IMAP_HOST, USER y PASSWORD.'
            )

        usuario_id = options['usuario_id'] or settings.CAPTURA_EMAIL_USUARIO_ID
        if not usuario_id:
            raise CommandError('Indica --usuario-id o CAPTURA_EMAIL_USUARIO_ID.')
        try:
            usuario = Usuario.objects.get(pk=int(usuario_id))
        except (Usuario.DoesNotExist, ValueError, TypeError) as exc:
            raise CommandError(f'Usuario inválido: {usuario_id}') from exc

        espacio = obtener_espacio_familiar_activo(usuario) or obtener_espacio_personal(usuario)
        if espacio is None:
            espacio = crear_espacio_personal(usuario)

        dry = options['dry_run']
        limit = options['limit']
        creados = 0

        self.stdout.write(f'Conectando IMAP {host} …')
        mail = imaplib.IMAP4_SSL(host)
        mail.login(user, password)
        mail.select(folder)
        typ, data = mail.search(None, 'UNSEEN')
        if typ != 'OK':
            raise CommandError('No se pudo buscar mensajes UNSEEN.')
        ids = data[0].split()[-limit:]
        metodo_default = (
            MetodoPago.objects.filter(tipo='CREDITO').first()
            or MetodoPago.objects.filter(tipo='DEBITO').first()
            or MetodoPago.objects.first()
        )

        for num in ids:
            typ, msg_data = mail.fetch(num, '(RFC822)')
            if typ != 'OK':
                continue
            raw = msg_data[0][1]
            msg = email.message_from_bytes(raw)
            subject = _decode_mime(msg.get('Subject'))
            from_addr = parseaddr(msg.get('From', ''))[1]
            body = _body_text(msg)
            hash_ext = hashlib.sha256(raw).hexdigest()

            parsed = parse_email(subject=subject, body=body, from_addr=from_addr)
            if parsed is None:
                self.stdout.write(f'  skip (sin parseo): {subject[:60]}')
                continue

            tarjeta = resolver_tarjeta_por_ultimos_4(
                usuario=usuario, ultimos_4=parsed.ultimos_4,
            )
            metodo = (
                MetodoPago.objects.filter(tipo='CREDITO').first()
                if tarjeta
                else metodo_default
            )

            if dry:
                self.stdout.write(
                    f'  [dry-run] ${parsed.monto} {parsed.comercio} '
                    f'4dig={parsed.ultimos_4} banco={parsed.banco}'
                )
                continue

            crear_pendiente(
                usuario=usuario,
                espacio=espacio,
                origen=MovimientoPendiente.ORIGEN_EMAIL_BANCO,
                monto=parsed.monto,
                fecha=parsed.fecha or timezone.localdate(),
                comercio=parsed.comercio,
                metodo_pago_sugerido=metodo,
                tarjeta_sugerida=tarjeta,
                confianza=parsed.confianza,
                payload_original={
                    'subject': subject,
                    'from': from_addr,
                    'banco': parsed.banco,
                    'ultimos_4': parsed.ultimos_4,
                },
                hash_externo=hash_ext,
                notificar=True,
            )
            creados += 1
            mail.store(num, '+FLAGS', '\\Seen')
            self.stdout.write(self.style.SUCCESS(f'  pendiente: ${parsed.monto} {parsed.comercio}'))

        mail.logout()
        self.stdout.write(self.style.SUCCESS(f'Listo. Creados={creados} dry_run={dry}'))
