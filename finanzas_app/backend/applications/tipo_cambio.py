"""
Conversión de montos en moneda extranjera a la moneda base del sistema.

Módulo transversal: lo usa la captura de correos bancarios y está disponible
para cualquier otra app que reciba montos en otra moneda (viajes, inversiones,
medios de pago futuros).

Fuente: mindicador.cl, que publica los indicadores del Banco Central de Chile
por fecha. Es gratuita y no requiere credenciales. Como esa fuente entrega
valores expresados en pesos chilenos, la conversión solo se ofrece cuando
`MONEDA_BASE` es CLP; con otra moneda base `convertir()` devuelve None en vez
de entregar una cifra incorrecta.

Advertencia sobre la precisión: para una compra internacional el emisor cobra a
su propio tipo de cambio en la fecha de liquidación, no al valor observado del
día de la operación, y suele agregar comisiones. Lo que entrega este módulo es
una **estimación** para registrar el gasto de inmediato; el monto real se
conoce recién en el estado de cuenta.
"""

from __future__ import annotations

import json
import logging
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from urllib import error as urllib_error
from urllib import request as urllib_request

from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

URL_BASE = 'https://mindicador.cl/api'
TIMEOUT_SEGUNDOS = 8

#: Días hacia atrás a explorar cuando la fecha pedida no tiene publicación
#: (fin de semana o feriado).
MAX_DIAS_ATRAS = 7

#: Las tasas históricas no cambian, así que se cachean por mucho tiempo.
CACHE_TTL_SEGUNDOS = 60 * 60 * 24 * 30

#: Moneda en la que la fuente expresa sus valores.
MONEDA_DE_LA_FUENTE = 'CLP'

#: Código de moneda → indicador en mindicador.cl.
MONEDAS_SOPORTADAS = {'USD': 'dolar', 'EUR': 'euro'}


def moneda_base() -> str:
    return (getattr(settings, 'MONEDA_BASE', MONEDA_DE_LA_FUENTE) or MONEDA_DE_LA_FUENTE).upper()


def requiere_conversion(moneda: str) -> bool:
    """True si `moneda` es distinta de la base y se puede convertir."""
    codigo = (moneda or '').upper()
    if not codigo or codigo == moneda_base():
        return False
    return codigo in MONEDAS_SOPORTADAS


def _clave_cache(indicador: str, dia: date) -> str:
    return f'tipo_cambio:{indicador}:{dia.isoformat()}'


def _consultar_dia(indicador: str, dia: date) -> Decimal | None:
    """
    Consulta la tasa publicada para un día puntual.

    Devuelve None si ese día no tiene publicación (fin de semana, feriado) o si
    la consulta falla. Nunca propaga errores de red: quien llama no debe caerse
    porque un servicio externo esté fuera.
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
    Tasa de `moneda` a la moneda base para `dia`.

    Si ese día no tiene publicación retrocede hasta el último día hábil con
    valor (hasta `MAX_DIAS_ATRAS`), que es el criterio que usa la propia banca.

    Devuelve `(tasa, fecha_de_la_tasa)` o None si no se pudo resolver. La fecha
    se retorna para poder mostrar de cuándo salió el valor usado.
    """
    if moneda_base() != MONEDA_DE_LA_FUENTE:
        return None
    indicador = MONEDAS_SOPORTADAS.get((moneda or '').upper())
    if indicador is None:
        return None

    for offset in range(MAX_DIAS_ATRAS + 1):
        candidato = dia - timedelta(days=offset)
        valor = _consultar_dia(indicador, candidato)
        if valor is not None and valor > 0:
            return valor, candidato
    return None


def convertir(monto: Decimal, moneda: str, dia: date) -> dict | None:
    """
    Convierte `monto` a la moneda base usando la tasa de `dia`.

    Devuelve el detalle de la conversión —pensado para guardarse junto al
    registro, de modo que quede trazable con qué tasa se calculó— o None si no
    hay tasa disponible, en cuyo caso quien llama debe conservar el monto
    original sin convertir.
    """
    resultado = obtener_tasa(moneda, dia)
    if resultado is None:
        return None
    tasa, fecha_tasa = resultado
    return {
        'monto_convertido': (monto * tasa).quantize(Decimal('0.01')),
        'moneda_destino': moneda_base(),
        'monto_original': monto,
        'moneda_original': (moneda or '').upper(),
        'tipo_cambio': tasa,
        'tipo_cambio_fecha': fecha_tasa,
        'tipo_cambio_fuente': 'mindicador.cl',
    }
