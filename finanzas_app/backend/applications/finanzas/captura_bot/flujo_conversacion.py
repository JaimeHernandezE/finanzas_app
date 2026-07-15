"""Flujo conversacional compartido WhatsApp / Telegram."""

from __future__ import annotations

from dataclasses import dataclass, field

from applications.espacios.models import Espacio
from applications.espacios.services import (
    crear_espacio_personal,
    obtener_espacio_familiar_activo,
    obtener_espacio_personal,
)
from applications.finanzas.captura_bot.parser_mensaje import parsear_mensaje
from applications.finanzas.models import (
    CodigoVinculoCaptura,
    MetodoPago,
    MovimientoPendiente,
)
from applications.finanzas.services.captura import (
    CapturaError,
    confirmar_pendiente,
    crear_pendiente,
    descartar_pendiente,
)
from applications.finanzas.services.captura.vinculo import canjear_codigo_vinculo
from applications.usuarios.models import Usuario


@dataclass
class BotReply:
    text: str
    buttons: list[dict[str, str]] = field(default_factory=list)
    # buttons: [{id, label}]


def resolver_usuario(canal: str, chat_id: str, phone: str = '') -> Usuario | None:
    if canal == 'TELEGRAM':
        return Usuario.objects.filter(
            telegram_chat_id=str(chat_id), telegram_vinculado=True,
        ).first()
    if canal == 'WHATSAPP':
        phone_n = (phone or chat_id or '').strip()
        if phone_n and not phone_n.startswith('+'):
            phone_n = f'+{phone_n}'
        return Usuario.objects.filter(
            whatsapp_phone=phone_n, whatsapp_vinculado=True,
        ).first()
    return None


def espacio_activo_usuario(usuario: Usuario) -> Espacio:
    familiar = obtener_espacio_familiar_activo(usuario)
    if familiar is not None:
        return familiar
    personal = obtener_espacio_personal(usuario)
    if personal is not None:
        return personal
    return crear_espacio_personal(usuario)


def _metodo_default() -> MetodoPago | None:
    return (
        MetodoPago.objects.filter(tipo='DEBITO').first()
        or MetodoPago.objects.filter(tipo='EFECTIVO').first()
        or MetodoPago.objects.first()
    )


def _botones_ambito(pendiente_id: int) -> list[dict[str, str]]:
    return [
        {'id': f'ambito:{pendiente_id}:COMUN', 'label': 'Común'},
        {'id': f'ambito:{pendiente_id}:PERSONAL', 'label': 'Personal'},
        {'id': f'descartar:{pendiente_id}', 'label': 'Descartar'},
    ]


def _botones_confirmar_rapido(pendiente_id: int) -> list[dict[str, str]]:
    return [
        {'id': f'confirmar:{pendiente_id}', 'label': 'Confirmar'},
        {'id': f'descartar:{pendiente_id}', 'label': 'Descartar'},
    ]


def listar_pendientes_reply(usuario: Usuario, espacio: Espacio) -> BotReply:
    qs = MovimientoPendiente.objects.filter(
        usuario=usuario,
        espacio=espacio,
        estado=MovimientoPendiente.ESTADO_PENDIENTE,
    ).order_by('-creado_at')[:10]
    if not qs:
        return BotReply(text='No tienes movimientos pendientes.')
    lines = ['Pendientes:']
    buttons: list[dict[str, str]] = []
    for p in qs:
        lines.append(f'• #{p.id} ${p.monto} {p.comercio or "(sin comercio)"}')
        buttons.append({'id': f'abrir:{p.id}', 'label': f'#{p.id} ${p.monto}'})
    lines.append('Toca uno para confirmar o escribe confirmar #<id>')
    return BotReply(text='\n'.join(lines), buttons=buttons)


def manejar_callback(
    *,
    canal: str,
    chat_id: str,
    callback_data: str,
    phone: str = '',
) -> BotReply:
    usuario = resolver_usuario(canal, chat_id, phone)
    if usuario is None:
        return BotReply(text='Vincula tu cuenta primero con /vincular CODIGO (lo generas en la app).')

    espacio = espacio_activo_usuario(usuario)
    parts = (callback_data or '').split(':')
    accion = parts[0] if parts else ''

    if accion == 'ambito' and len(parts) >= 3:
        try:
            pid = int(parts[1])
        except ValueError:
            return BotReply(text='Callback inválido.')
        ambito = parts[2]
        try:
            pendiente = MovimientoPendiente.objects.get(
                pk=pid, usuario=usuario, espacio=espacio,
                estado=MovimientoPendiente.ESTADO_PENDIENTE,
            )
        except MovimientoPendiente.DoesNotExist:
            return BotReply(text='Pendiente no encontrado.')
        pendiente.ambito_sugerido = ambito
        pendiente.save(update_fields=['ambito_sugerido', 'actualizado_at'])
        if pendiente.categoria_sugerida_id and pendiente.metodo_pago_sugerido_id:
            try:
                mov = confirmar_pendiente(pendiente)
            except CapturaError as exc:
                return BotReply(text=f'No pude confirmar: {exc.mensaje}')
            return BotReply(text=f'Listo. Movimiento #{mov.id} registrado (${mov.monto}).')
        return BotReply(
            text=(
                f'Ámbito {ambito} guardado. '
                'Confirma en la app o usa Confirmar si ya tienes categoría/método.'
            ),
            buttons=_botones_confirmar_rapido(pendiente.id),
        )

    if accion == 'confirmar' and len(parts) >= 2:
        try:
            pid = int(parts[1])
            pendiente = MovimientoPendiente.objects.get(
                pk=pid, usuario=usuario, espacio=espacio,
                estado=MovimientoPendiente.ESTADO_PENDIENTE,
            )
            mov = confirmar_pendiente(pendiente)
            return BotReply(text=f'Confirmado: movimiento #{mov.id} (${mov.monto}).')
        except MovimientoPendiente.DoesNotExist:
            return BotReply(text='Pendiente no encontrado.')
        except CapturaError as exc:
            return BotReply(text=f'Falta información: {exc.mensaje}. Complétalo en la app.')

    if accion == 'descartar' and len(parts) >= 2:
        try:
            pid = int(parts[1])
            pendiente = MovimientoPendiente.objects.get(
                pk=pid, usuario=usuario, espacio=espacio,
                estado=MovimientoPendiente.ESTADO_PENDIENTE,
            )
            descartar_pendiente(pendiente)
            return BotReply(text=f'Pendiente #{pid} descartado.')
        except MovimientoPendiente.DoesNotExist:
            return BotReply(text='Pendiente no encontrado.')
        except CapturaError as exc:
            return BotReply(text=exc.mensaje)

    if accion == 'abrir' and len(parts) >= 2:
        try:
            pid = int(parts[1])
            pendiente = MovimientoPendiente.objects.get(
                pk=pid, usuario=usuario, espacio=espacio,
                estado=MovimientoPendiente.ESTADO_PENDIENTE,
            )
        except MovimientoPendiente.DoesNotExist:
            return BotReply(text='Pendiente no encontrado.')
        text = (
            f'#{pendiente.id} ${pendiente.monto} — {pendiente.comercio or "sin comercio"}\n'
            f'Ámbito sugerido: {pendiente.ambito_sugerido or "—"}\n'
            'Elige ámbito:'
        )
        return BotReply(text=text, buttons=_botones_ambito(pendiente.id))

    return BotReply(text='Acción no reconocida.')


def manejar_texto(
    *,
    canal: str,
    chat_id: str,
    texto: str,
    phone: str = '',
) -> BotReply:
    texto = (texto or '').strip()
    if not texto:
        return BotReply(text='Envía un gasto (ej: "2 lucas café") o "pendientes".')

    lower = texto.lower()

    # Vinculación
    if lower.startswith('/vincular') or lower.startswith('vincular '):
        partes = texto.split(None, 1)
        codigo = partes[1].strip() if len(partes) > 1 else ''
        if not codigo:
            return BotReply(text='Uso: /vincular CODIGO')
        try:
            canal_v = (
                CodigoVinculoCaptura.CANAL_TELEGRAM
                if canal == 'TELEGRAM'
                else CodigoVinculoCaptura.CANAL_WHATSAPP
            )
            canjear_codigo_vinculo(
                codigo,
                canal=canal_v,
                telegram_chat_id=str(chat_id) if canal == 'TELEGRAM' else '',
                whatsapp_phone=phone or (f'+{chat_id}' if chat_id else ''),
            )
            return BotReply(text='Cuenta vinculada. Ya puedes registrar gastos aquí.')
        except ValueError as exc:
            return BotReply(text=str(exc))

    usuario = resolver_usuario(canal, chat_id, phone)
    if usuario is None:
        return BotReply(
            text=(
                'Aún no estás vinculado. En la app: Configuración → Captura → generar código, '
                'luego envía /vincular CODIGO.'
            ),
        )

    espacio = espacio_activo_usuario(usuario)

    if lower in ('pendientes', '/pendientes', 'pending'):
        return listar_pendientes_reply(usuario, espacio)

    if lower.startswith('confirmar #'):
        try:
            pid = int(lower.replace('confirmar #', '').strip())
            pendiente = MovimientoPendiente.objects.get(
                pk=pid, usuario=usuario, espacio=espacio,
                estado=MovimientoPendiente.ESTADO_PENDIENTE,
            )
            mov = confirmar_pendiente(pendiente)
            return BotReply(text=f'Confirmado: movimiento #{mov.id}.')
        except (ValueError, MovimientoPendiente.DoesNotExist):
            return BotReply(text='No encontré ese pendiente.')
        except CapturaError as exc:
            return BotReply(text=f'No pude confirmar: {exc.mensaje}')

    if lower.startswith('ayuda') or lower == '/start' or lower == '/help':
        return BotReply(
            text=(
                'Puedes:\n'
                '• Escribir un gasto: "12500 lider" o "2 lucas café"\n'
                '• "pendientes" — listar y confirmar\n'
                '• /vincular CODIGO — asociar tu cuenta'
            ),
        )

    parsed = parsear_mensaje(texto)
    if parsed.get('monto') is None:
        return BotReply(
            text='No entendí el monto. Prueba "12500 supermercado" o "2 lucas café".',
        )

    metodo = _metodo_default()
    origen = (
        MovimientoPendiente.ORIGEN_TELEGRAM
        if canal == 'TELEGRAM'
        else MovimientoPendiente.ORIGEN_WHATSAPP
    )
    pendiente = crear_pendiente(
        usuario=usuario,
        espacio=espacio,
        origen=origen,
        monto=parsed['monto'],
        comercio=parsed.get('comercio') or '',
        metodo_pago_sugerido=metodo,
        confianza=float(parsed.get('confianza') or 0.5),
        payload_original={'raw': parsed.get('raw') or texto, 'canal': canal},
    )
    return BotReply(
        text=(
            f'Registrado borrador #{pendiente.id}: ${pendiente.monto}'
            f'{" — " + pendiente.comercio if pendiente.comercio else ""}.\n'
            '¿Ámbito?'
        ),
        buttons=_botones_ambito(pendiente.id),
    )
