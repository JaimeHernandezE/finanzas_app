"""Contexto de recálculo (usuario/origen) para signals sin acceso al request HTTP."""

from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass


@dataclass
class RecalculoContext:
    modificado_por_id: int | None = None
    origen_tipo: str | None = None
    origen_id: int | None = None
    suprimir_notificaciones: bool = False
    payloads_resumen_antes: dict[str, dict] | None = None


_ctx: ContextVar[RecalculoContext | None] = ContextVar('finanzas_recalculo_ctx', default=None)


def get_recalculo_context() -> RecalculoContext | None:
    return _ctx.get()


@contextmanager
def recalculo_context(ctx: RecalculoContext | None):
    token = _ctx.set(ctx)
    try:
        yield
    finally:
        _ctx.reset(token)
