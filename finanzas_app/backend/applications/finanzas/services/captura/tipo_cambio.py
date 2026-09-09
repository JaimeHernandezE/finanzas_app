"""
Tipo de cambio para montos de correos bancarios en moneda extranjera.

Fuente: mindicador.cl, que publica el dólar observado del Banco Central de
Chile por fecha. Es gratuita y no requiere credenciales.

Advertencia sobre la precisión: para una compra internacional el banco cobra a
su propio tipo de cambio en la fecha de liquidación, no al dólar observado del
día de la compra, y suele agregar comisiones. El valor que entrega este módulo
es una **estimación** para poder registrar el gasto de inmediato; el monto real
se conoce recién en el estado de cuenta.
"""

from __future__ import annotations

import json
import logging
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from urllib import error as urllib_error
from urllib import request as urllib_request

from django.core.cache import cache

logger = logging.getLogger(__name__)

URL_BASE = 'https://mindicador.cl/api'
TIMEOUT_SEGUNDOS = 8

#: Días hábiles hacia atrás a explorar cuando la fecha pedida no tiene
#: publicación (fin de semana o feriado).
MAX_DIAS_ATRAS = 7

#: Las tasas históricas no cambian, así que se cachean por mucho tiempo.
CACHE_TTL_SEGUNDOS = 60 * 60 * 24 * 30

MONEDAS_SOPORTADAS = {'USD': 'dolar', 'EUR': 'euro'}


class TipoCambioNoDisponible(Exception):
    """No se pudo obtener una tasa para la moneda y fecha pedidas."""


def _clave_cache(indicador: str, dia: date) -> str:
    return f'tipo_cambio:{indicador}:{dia.isoformat()}'


def _consultar_dia(indicador: str, dia: date) -> Decimal | None:
    """
    Consulta la tasa publicada para un día puntual.

    Devuelve None si ese día no tiene publicación (fin de semana, feriado) o si
    la consulta falla. Nunca propaga errores de red: el ingest de correos no
    debe caerse porque un servicio externo esté fuera.
    """
    cacheado = cache.get(_clave_cache(indicador, dia))
    if cacheado is not None:
        return Decimal(cacheado) if cacheado != '' else None

    url = f'{URL_BASE}/{indicador}/{dia:%d-%m-%Y}'
    try:
        with urllib_request.urlopen(url, timeout=TIMEOUT_SEGUNDOS) as resp:
            payload = json.loads(resp.read().decode('utf-8'))
    except (urllib_error.URLError, TimeoutError, ValueError, OSError) as exc:
        logger.warning('tipo_cambio: falló la consulta a %s (%s)', url, exc)
        return None

    serie = payload.get('serie') or []
    if not serie:
        # Día sin publicación: se cachea el vacío para no re-consultar.
        cache.set(_clave_cache(indicador, dia), '', CACHE_TTL_SEGUNDOS)
        return None

    try:
        valor = Decimal(str(serie[0]['valor']))
    except (KeyError, IndexError, InvalidOperation, TypeError):
        logger.warning('tipo_cambio: respuesta inesperada de %s', url)
        return None

    cache.set(_clave_cache(indicador, dia), str(valor), CACHE_TTL_SEGUNDOS)
    return valor


def obtener_tasa(moneda: str, dia: date) -> tuple[Decimal, date] | None:
    """
    Tasa de `moneda` a CLP para `dia`.

    Si ese día no tiene publicación retrocede hasta el último día hábil con
    valor (hasta `MAX_DIAS_ATRAS`), que es el criterio que usa la propia banca.

    Devuelve `(tasa, fecha_de_la_tasa)` o None si no se pudo resolver. La fecha
    se retorna para poder mostrar de cuándo salió el valor usado.
    """
    indicador = MONEDAS_SOPORTADAS.get((moneda or '').upper())
    if indicador is None:
        return None

    for offset in range(MAX_DIAS_ATRAS + 1):
        candidato = dia - timedelta(days=offset)
        valor = _consultar_dia(indicador, candidato)
        if valor is not None and valor > 0:
            return valor, candidato
    return None


def convertir_a_clp(monto: Decimal, moneda: str, dia: date) -> dict | None:
    """
    Convierte `monto` a pesos usando la tasa de `dia`.

    Devuelve un dict con el detalle de la conversión —pensado para guardarse en
    `payload_original`— o None si no hay tasa disponible, en cuyo caso el
    llamador debe conservar el monto original sin convertir.
    """
    resultado = obtener_tasa(moneda, dia)
    if resultado is None:
        return None
    tasa, fecha_tasa = resultado
    return {
        'monto_clp': (monto * tasa).quantize(Decimal('0.01')),
        'monto_original': monto,
        'moneda_original': (moneda or '').upper(),
        'tipo_cambio': tasa,
        'tipo_cambio_fecha': fecha_tasa,
        'tipo_cambio_fuente': 'mindicador.cl',
    }
