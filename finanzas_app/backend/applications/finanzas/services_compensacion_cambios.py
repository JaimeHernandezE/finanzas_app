"""Detección de cambios en compensación mensual y notificaciones in-app."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from django.contrib.auth import get_user_model
from django.utils import timezone

from applications.usuarios.formato_moneda import formatear_monto_codigo

from .models import CambioCompensacionMensual, NotificacionUsuario

User = get_user_model()

_UMBRAL = Decimal('0.01')
_MESES_ES = (
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
)


def _d(val) -> Decimal:
    try:
        return Decimal(str(val))
    except Exception:
        return Decimal('0')


def _cambio_material(a: Decimal, b: Decimal) -> bool:
    return abs(a - b) > _UMBRAL


def _transferencias_index(payload: dict | None) -> dict[tuple[int, int], Decimal]:
    if not payload:
        return {}
    out: dict[tuple[int, int], Decimal] = {}
    for t in (payload.get('compensacion') or {}).get('transferencias_sugeridas') or []:
        de_id = int(t.get('de_usuario_id') or 0)
        a_id = int(t.get('a_usuario_id') or 0)
        if de_id and a_id:
            out[(de_id, a_id)] = _d(t.get('monto'))
    return out


def _diferencias_por_usuario(payload: dict | None) -> dict[int, Decimal]:
    if not payload:
        return {}
    out: dict[int, Decimal] = {}
    for row in (payload.get('compensacion') or {}).get('por_usuario') or []:
        uid = int(row.get('usuario_id') or 0)
        if uid:
            out[uid] = _d(row.get('diferencia'))
    return out


def _gastos_prorrateados_por_usuario(payload: dict | None) -> dict[int, Decimal]:
    if not payload:
        return {}
    out: dict[int, Decimal] = {}
    for row in (payload.get('compensacion') or {}).get('por_usuario') or []:
        uid = int(row.get('usuario_id') or 0)
        if uid:
            out[uid] = _d(row.get('gasto_prorrateado'))
    return out


def _pagado_efectivo_por_usuario(payload: dict | None) -> dict[int, Decimal]:
    if not payload:
        return {}
    out: dict[int, Decimal] = {}
    for row in (payload.get('compensacion') or {}).get('por_usuario') or []:
        uid = int(row.get('usuario_id') or 0)
        if uid:
            out[uid] = _d(row.get('pagado_efectivo'))
    return out


def detectar_cambios_compensacion(
    payload_antes: dict | None,
    payload_despues: dict,
) -> dict[str, Any] | None:
    """
    Compara dos payloads de resumen mensual.
    Retorna None si no hay cambio material en compensación.
    """
    if payload_antes is None:
        return None

    dif_antes = _diferencias_por_usuario(payload_antes)
    dif_despues = _diferencias_por_usuario(payload_despues)
    uids = set(dif_antes) | set(dif_despues)

    diferencias_usuario = []
    for uid in sorted(uids):
        a = dif_antes.get(uid, Decimal('0'))
        b = dif_despues.get(uid, Decimal('0'))
        if _cambio_material(a, b):
            diferencias_usuario.append(
                {
                    'usuario_id': uid,
                    'antes': str(a.quantize(Decimal('0.01'))),
                    'despues': str(b.quantize(Decimal('0.01'))),
                    'delta': str((b - a).quantize(Decimal('0.01'))),
                }
            )

    tr_antes = _transferencias_index(payload_antes)
    tr_despues = _transferencias_index(payload_despues)
    pares = set(tr_antes) | set(tr_despues)

    transferencias_afectadas = []
    for par in sorted(pares):
        ma = tr_antes.get(par, Decimal('0'))
        mb = tr_despues.get(par, Decimal('0'))
        if _cambio_material(ma, mb):
            de_id, a_id = par
            transferencias_afectadas.append(
                {
                    'de_usuario_id': de_id,
                    'a_usuario_id': a_id,
                    'monto_antes': str(ma.quantize(Decimal('0.01'))),
                    'monto_despues': str(mb.quantize(Decimal('0.01'))),
                }
            )

    pror_antes = _gastos_prorrateados_por_usuario(payload_antes)
    pror_despues = _gastos_prorrateados_por_usuario(payload_despues)
    pag_antes = _pagado_efectivo_por_usuario(payload_antes)
    pag_despues = _pagado_efectivo_por_usuario(payload_despues)
    uids_pror = set(pror_antes) | set(pror_despues) | set(pag_antes) | set(pag_despues)

    prorrateo_usuario = []
    for uid in sorted(uids_pror):
        ga = pror_antes.get(uid, Decimal('0'))
        gb = pror_despues.get(uid, Decimal('0'))
        pa = pag_antes.get(uid, Decimal('0'))
        pb = pag_despues.get(uid, Decimal('0'))
        if _cambio_material(ga, gb) or _cambio_material(pa, pb):
            prorrateo_usuario.append(
                {
                    'usuario_id': uid,
                    'gasto_prorrateado_antes': str(ga.quantize(Decimal('0.01'))),
                    'gasto_prorrateado_despues': str(gb.quantize(Decimal('0.01'))),
                    'pagado_efectivo_antes': str(pa.quantize(Decimal('0.01'))),
                    'pagado_efectivo_despues': str(pb.quantize(Decimal('0.01'))),
                }
            )

    if not diferencias_usuario and not transferencias_afectadas and not prorrateo_usuario:
        return None

    mes = int(payload_despues.get('mes') or payload_antes.get('mes') or 0)
    anio = int(payload_despues.get('anio') or payload_antes.get('anio') or 0)

    return {
        'mes': mes,
        'anio': anio,
        'diferencias_usuario': diferencias_usuario,
        'transferencias_antes': [
            {
                'de_usuario_id': de_id,
                'a_usuario_id': a_id,
                'monto': str(m.quantize(Decimal('0.01'))),
            }
            for (de_id, a_id), m in sorted(tr_antes.items())
        ],
        'transferencias_despues': [
            {
                'de_usuario_id': de_id,
                'a_usuario_id': a_id,
                'monto': str(m.quantize(Decimal('0.01'))),
            }
            for (de_id, a_id), m in sorted(tr_despues.items())
        ],
        'transferencias_afectadas': transferencias_afectadas,
        'prorrateo_usuario': prorrateo_usuario,
    }


def _nombre_usuario(uid: int, payload: dict) -> str:
    for bloque in (
        (payload.get('compensacion') or {}).get('por_usuario') or [],
        payload.get('gastos_comunes_por_usuario') or [],
        payload.get('sueldos_por_usuario') or [],
    ):
        for row in bloque:
            if int(row.get('usuario_id') or 0) == uid:
                n = (row.get('nombre') or '').strip()
                if n:
                    return n
    u = User.objects.filter(pk=uid).first()
    if u is None:
        return str(uid)
    return (u.get_full_name() or u.first_name or u.email or u.username or str(uid)).strip()


def _etiqueta_mes(mes_pd: date) -> str:
    return f'{_MESES_ES[mes_pd.month - 1]} {mes_pd.year}'


def _es_mes_actual(mes_pd: date) -> bool:
    """El mes en curso se recalcula en vivo; no se envían notificaciones de compensación."""
    hoy = timezone.localdate()
    return mes_pd.year == hoy.year and mes_pd.month == hoy.month


def _compensacion_desde_payload(payload: dict | None) -> dict:
    if not payload:
        return {'por_usuario': [], 'transferencias_sugeridas': []}
    comp = payload.get('compensacion') or {}
    return {
        'por_usuario': comp.get('por_usuario') or [],
        'transferencias_sugeridas': comp.get('transferencias_sugeridas') or [],
    }


def _mensaje_para_usuario(
    usuario_id: int,
    delta: dict,
    payload_despues: dict,
    modificado_por_id: int | None,
    moneda_codigo: str,
) -> tuple[str, str]:
    mes = int(delta.get('mes') or 1)
    anio = int(delta.get('anio') or 2000)
    mes_pd = date(anio, mes, 1)
    etiqueta_mes = _etiqueta_mes(mes_pd)

    def _fm(monto) -> str:
        return formatear_monto_codigo(monto, moneda_codigo)

    mod_nombre = 'Alguien'
    if modificado_por_id:
        mod_nombre = _nombre_usuario(modificado_por_id, payload_despues)

    titulo = f'Cambio en compensación de {etiqueta_mes}'

    if modificado_por_id and usuario_id == modificado_por_id:
        partes: list[str] = [
            f'Modificaste datos del fondo común de {etiqueta_mes}; '
            f'cambió el pago propuesto entre las partes.'
        ]
    else:
        partes = [f'{mod_nombre} modificó datos del fondo común de {etiqueta_mes}.']

    for tr in delta.get('transferencias_afectadas') or []:
        de_id = int(tr['de_usuario_id'])
        a_id = int(tr['a_usuario_id'])
        antes = _d(tr.get('monto_antes'))
        despues = _d(tr.get('monto_despues'))
        a_nombre = _nombre_usuario(a_id, payload_despues)
        de_nombre = _nombre_usuario(de_id, payload_despues)
        if usuario_id == de_id:
            if despues <= _UMBRAL and antes > _UMBRAL:
                partes.append(f'Ya no se sugiere que debas {_fm(antes)} a {a_nombre}.')
            elif despues > _UMBRAL:
                if antes > _UMBRAL:
                    partes.append(
                        f'Ahora se sugiere que debas {_fm(despues)} a {a_nombre} (antes {_fm(antes)}).'
                    )
                else:
                    partes.append(f'Ahora se sugiere que debas {_fm(despues)} a {a_nombre}.')
        elif usuario_id == a_id:
            if despues <= _UMBRAL and antes > _UMBRAL:
                partes.append(f'Ya no se sugiere que {de_nombre} te deba {_fm(antes)}.')
            elif despues > _UMBRAL:
                if antes > _UMBRAL:
                    partes.append(
                        f'Ahora se sugiere que {de_nombre} te pague {_fm(despues)} (antes {_fm(antes)}).'
                    )
                else:
                    partes.append(f'Ahora se sugiere que {de_nombre} te pague {_fm(despues)}.')

    mi_diff = next(
        (d for d in delta.get('diferencias_usuario') or [] if int(d['usuario_id']) == usuario_id),
        None,
    )
    if mi_diff and usuario_id not in {
        int(t['de_usuario_id']) for t in delta.get('transferencias_afectadas') or []
    } and usuario_id not in {
        int(t['a_usuario_id']) for t in delta.get('transferencias_afectadas') or []
    }:
        antes = _d(mi_diff.get('antes'))
        despues = _d(mi_diff.get('despues'))
        partes.append(
            f'Tu diferencia de compensación pasó de {_fm(antes)} a {_fm(despues)}.'
        )

    mi_pror = next(
        (p for p in delta.get('prorrateo_usuario') or [] if int(p['usuario_id']) == usuario_id),
        None,
    )
    if mi_pror and usuario_id not in {
        int(t['de_usuario_id']) for t in delta.get('transferencias_afectadas') or []
    } and usuario_id not in {
        int(t['a_usuario_id']) for t in delta.get('transferencias_afectadas') or []
    } and not mi_diff:
        ga = _d(mi_pror.get('gasto_prorrateado_antes'))
        gb = _d(mi_pror.get('gasto_prorrateado_despues'))
        pa = _d(mi_pror.get('pagado_efectivo_antes'))
        pb = _d(mi_pror.get('pagado_efectivo_despues'))
        if _cambio_material(ga, gb):
            partes.append(
                f'Tu gasto prorrateado esperado pasó de {_fm(ga)} a {_fm(gb)}.'
            )
        if _cambio_material(pa, pb):
            partes.append(
                f'Tu neto pagado en común pasó de {_fm(pa)} a {_fm(pb)}.'
            )

    return titulo, ' '.join(partes)


def registrar_cambio_y_notificar(
    *,
    espacio_id: int,
    mes_pd: date,
    payload_antes: dict | None,
    payload_despues: dict,
    origen_tipo: str,
    origen_id: int | None,
    modificado_por_id: int | None,
) -> CambioCompensacionMensual | None:
    delta = detectar_cambios_compensacion(payload_antes, payload_despues)
    if delta is None:
        return None

    if _es_mes_actual(mes_pd):
        return None

    cambio = CambioCompensacionMensual.objects.create(
        espacio_id=espacio_id,
        mes=mes_pd,
        delta=delta,
        payload_antes=payload_antes,
        payload_despues=payload_despues,
        origen_tipo=origen_tipo,
        origen_id=origen_id,
        modificado_por_id=modificado_por_id,
    )

    destinatarios: set[int] = set()
    for row in delta.get('diferencias_usuario') or []:
        destinatarios.add(int(row['usuario_id']))
    for row in delta.get('prorrateo_usuario') or []:
        destinatarios.add(int(row['usuario_id']))
    for tr in delta.get('transferencias_afectadas') or []:
        destinatarios.add(int(tr['de_usuario_id']))
        destinatarios.add(int(tr['a_usuario_id']))

    monedas_por_uid = dict(
        User.objects.filter(pk__in=destinatarios).values_list('pk', 'moneda_display')
    )

    for uid in sorted(destinatarios):
        moneda_codigo = (monedas_por_uid.get(uid) or 'CLP').upper()
        titulo, mensaje = _mensaje_para_usuario(
            uid, delta, payload_despues, modificado_por_id, moneda_codigo
        )
        NotificacionUsuario.objects.create(
            usuario_id=uid,
            espacio_id=espacio_id,
            cambio=cambio,
            tipo=NotificacionUsuario.TIPO_CAMBIO_COMPENSACION,
            titulo=titulo,
            mensaje=mensaje,
            payload={
                'mes': delta.get('mes'),
                'anio': delta.get('anio'),
                'cambio_id': cambio.pk,
                'delta': delta,
                'compensacion': _compensacion_desde_payload(payload_despues),
            },
        )

    return cambio


def serializar_notificacion(n: NotificacionUsuario) -> dict:
    payload = dict(n.payload or {})
    if (
        n.tipo == NotificacionUsuario.TIPO_CAMBIO_COMPENSACION
        and n.espacio_id
        and payload.get('mes')
        and payload.get('anio')
    ):
        from . import services_recalculo

        try:
            mes_pd = date(int(payload['anio']), int(payload['mes']), 1)
            snap = services_recalculo._obtener_payload_resumen_mes(
                n.espacio_id,
                mes_pd,
                persistir_si_falta=False,
            )
            if snap and snap.get('compensacion'):
                payload['compensacion'] = _compensacion_desde_payload(snap)
        except (TypeError, ValueError):
            pass

    return {
        'id': n.pk,
        'tipo': n.tipo,
        'titulo': n.titulo,
        'mensaje': n.mensaje,
        'payload': payload,
        'espacio_id': n.espacio_id,
        'leida': n.leida_at is not None,
        'leida_at': n.leida_at.isoformat() if n.leida_at else None,
        'creado_at': n.creado_at.isoformat(),
    }
