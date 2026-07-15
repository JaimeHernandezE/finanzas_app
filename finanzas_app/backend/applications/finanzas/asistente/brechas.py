"""Registro de brechas del asistente (telemetría de producto)."""

from __future__ import annotations

import re

from applications.finanzas.models import BrechaConsultaAsistente

_MAX_MSG = 240

# Heurísticas simples → intento_label (snake_case corto).
_LABEL_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r'presupuesto|umbrales?', re.I), 'avance_presupuesto'),
    (re.compile(r'alerta|avisaste|notific', re.I), 'listar_alertas'),
    (re.compile(r'resumen|cerramos|prorrateo|compensaci', re.I), 'resumen_mes'),
    (re.compile(r'categor[ií]a|gast[eé]|supermercado|cu[aá]nto', re.I), 'gasto_categoria'),
    (re.compile(r'viaje', re.I), 'gasto_por_viaje'),
    (re.compile(r'comentario|perro|auto|regalo', re.I), 'buscar_comentario'),
]


def normalizar_mensaje(mensaje: str, max_len: int = _MAX_MSG) -> str:
    texto = (mensaje or '').strip()
    texto = re.sub(r'\d', '#', texto)
    if len(texto) > max_len:
        texto = texto[: max_len - 1] + '…'
    return texto


def inferir_intento_label(mensaje: str) -> str:
    for pattern, label in _LABEL_PATTERNS:
        if pattern.search(mensaje or ''):
            return label
    return 'otro'


def registrar_brecha(
    *,
    usuario,
    espacio,
    senal: str,
    mensaje: str,
    tools_intentadas: list[str] | None = None,
    intento_label: str | None = None,
    modelo: str = '',
    provider: str = '',
) -> BrechaConsultaAsistente:
    label = (intento_label or '').strip() or inferir_intento_label(mensaje)
    if len(label) > 64:
        label = label[:64]
    return BrechaConsultaAsistente.objects.create(
        usuario=usuario,
        espacio=espacio,
        senal=senal,
        mensaje_normalizado=normalizar_mensaje(mensaje),
        intento_label=label or 'otro',
        tools_intentadas=list(tools_intentadas or []),
        modelo=modelo or '',
        provider=provider or '',
    )
