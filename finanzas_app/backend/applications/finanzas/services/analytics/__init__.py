"""
Capa analytics del asistente financiero (Etapa A).

Funciones de solo lectura, JSON-serializables, delegando en presupuesto_mes,
notificaciones y resumen histórico. Sin LLM ni endpoints HTTP.
"""

from applications.finanzas.services.analytics.alertas import listar_alertas_recientes
from applications.finanzas.services.analytics.presupuesto import (
    avance_presupuesto_mes,
    gasto_categoria_por_mes,
)
from applications.finanzas.services.analytics.resumen import resumen_mes_cerrado

__all__ = [
    'gasto_categoria_por_mes',
    'avance_presupuesto_mes',
    'listar_alertas_recientes',
    'resumen_mes_cerrado',
]
