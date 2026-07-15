"""Resolución de categorías por id o nombre para tools del asistente."""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from django.db.models import Q

from applications.finanzas.models import Categoria

# El usuario dice «comida»; en muchos datasets la categoría se llama «Alimentación».
_SINONIMOS: dict[str, tuple[str, ...]] = {
    'comida': ('comida', 'alimentacion', 'alimentación', 'alimentos', 'supermercado', 'despensa'),
    'alimentacion': ('comida', 'alimentacion', 'alimentación', 'alimentos'),
    'alimentación': ('comida', 'alimentacion', 'alimentación', 'alimentos'),
    'supermercado': ('supermercado', 'comida', 'alimentacion', 'alimentación'),
    'bencina': ('bencina', 'combustible', 'gasolina', 'auto', 'nafta'),
    'combustible': ('bencina', 'combustible', 'gasolina'),
    'transporte': ('transporte', 'movilidad', 'uber', 'micro', 'metro'),
    'ocio': ('ocio', 'entretencion', 'entretenimiento', 'salidas'),
    'entretencion': ('ocio', 'entretencion', 'entretenimiento'),
}


def _sin_tildes(s: str) -> str:
    nfkd = unicodedata.normalize('NFKD', s)
    return ''.join(c for c in nfkd if not unicodedata.combining(c)).lower().strip()


def _qs_visibles(usuario, espacio, ambito: str):
    """Categorías que el usuario puede consultar en el espacio (globales + del tenant)."""
    q_globales = Q(espacio__isnull=True, usuario__isnull=True)
    ambito = (ambito or 'FAMILIAR').upper()

    if getattr(espacio, 'es_personal', False) or ambito == 'PERSONAL':
        qs_base = q_globales | Q(usuario=usuario)
        if not getattr(espacio, 'es_personal', False):
            qs_base = qs_base | Q(usuario=usuario, espacio=espacio)
        return Categoria.objects.filter(qs_base, tipo='EGRESO')

    # FAMILIAR: globales del sistema + compartidas del espacio (sin personales).
    qs_base = q_globales | Q(espacio=espacio, usuario__isnull=True)
    return Categoria.objects.filter(qs_base, tipo='EGRESO')


def _dedup_cats(cats: list[Categoria]) -> list[Categoria]:
    seen: set[int] = set()
    out: list[Categoria] = []
    for c in cats:
        if c.pk in seen:
            continue
        seen.add(c.pk)
        out.append(c)
    return out


def _preferir_espacio(hits: list[Categoria], espacio) -> list[Categoria]:
    """Si hay duplicados global + del espacio, prioriza las del espacio activo."""
    espacio_id = getattr(espacio, 'pk', None)
    if not espacio_id or len(hits) <= 1:
        return hits
    locales = [c for c in hits if c.espacio_id == espacio_id]
    if not locales:
        return hits
    # Mismo nombre en local y global → quedarse con locales
    nombres_local = {_sin_tildes(c.nombre) for c in locales}
    filtrados = []
    for c in hits:
        if c.espacio_id == espacio_id:
            filtrados.append(c)
        elif _sin_tildes(c.nombre) not in nombres_local:
            filtrados.append(c)
    return filtrados or hits


def _buscar_por_termino(qs, termino: str) -> list[Categoria]:
    term = (termino or '').strip()
    if not term:
        return []

    exact = list(qs.filter(nombre__iexact=term)[:8])
    if exact:
        return exact

    needle = _sin_tildes(term)
    # Exacto sin tildes (antes de icontains amplio)
    exact_norm = []
    for cat in qs.order_by('nombre')[:300]:
        if _sin_tildes(cat.nombre) == needle:
            exact_norm.append(cat)
        if len(exact_norm) >= 8:
            break
    if exact_norm:
        return exact_norm

    contains = list(qs.filter(nombre__icontains=term).order_by('nombre')[:8])
    if contains:
        return contains

    # Parcial sin tildes (needle contenido en el nombre, no al revés: evita «al» → todo)
    hits = []
    if len(needle) < 3:
        return []
    for cat in qs.order_by('nombre')[:300]:
        nom = _sin_tildes(cat.nombre)
        if needle in nom:
            hits.append(cat)
        if len(hits) >= 8:
            break
    return hits


def _payload_ambiguo(nombre_hint: str, hits: list[Categoria]) -> dict:
    candidatos = [
        {'categoria_id': c.pk, 'categoria_nombre': c.nombre} for c in hits[:8]
    ]
    # Un nombre por chip (si hay dos ids con el mismo nombre, un solo chip)
    nombres: list[str] = []
    for c in candidatos:
        if c['categoria_nombre'] not in nombres:
            nombres.append(c['categoria_nombre'])
    lista = ', '.join(f'«{n}»' for n in nombres)
    return {
        'error': 'varias_categorias',
        'mensaje': (
            f'Varias categorías coinciden con «{nombre_hint}»: {lista}. '
            'Lista estas opciones al usuario y pídele que elija una por nombre exacto.'
        ),
        'candidatos': candidatos,
        'sugerencias_seguimiento': [
            f'¿Cómo voy en {n} en gastos comunes este mes?' for n in nombres[:6]
        ],
    }


def _payload_sin_match(nombre_hint: str, qs) -> dict:
    # Cercanas por prefijo / icontains corto para orientar al usuario
    sugeridas: list[Categoria] = []
    term = nombre_hint.strip()
    if len(term) >= 3:
        sugeridas = list(qs.filter(nombre__icontains=term[:4]).order_by('nombre')[:6])
    if not sugeridas:
        sugeridas = list(qs.order_by('nombre')[:6])
    nombres = []
    for c in sugeridas:
        if c.nombre not in nombres:
            nombres.append(c.nombre)
    lista = ', '.join(f'«{n}»' for n in nombres)
    payload: dict[str, Any] = {
        'error': 'categoria_no_encontrada',
        'mensaje': (
            f'No encontré una categoría que coincida con «{nombre_hint}».'
            + (f' Categorías disponibles cercanas: {lista}.' if nombres else '')
        ),
    }
    if nombres:
        payload['candidatos'] = [
            {'categoria_id': c.pk, 'categoria_nombre': c.nombre} for c in sugeridas[:6]
        ]
        payload['sugerencias_seguimiento'] = [
            f'¿Cómo voy en {n} en gastos comunes este mes?' for n in nombres[:6]
        ]
    else:
        payload['sugerencia'] = 'Revisa los nombres exactos en la pantalla de categorías.'
    return payload


def resolver_categoria(
    usuario,
    espacio,
    *,
    categoria_id: Any = None,
    categoria_nombre: str | None = None,
    ambito: str = 'FAMILIAR',
) -> dict:
    """
    Resuelve a un pk de categoría.
    Acepta id numérico, o nombre (también si el LLM metió el nombre en categoria_id).
    """
    nombre_hint: str | None = None
    pk: int | None = None

    if categoria_id is not None and categoria_id != '' and str(categoria_id).lower() not in (
        'none',
        'null',
    ):
        try:
            pk = int(categoria_id)
        except (TypeError, ValueError):
            nombre_hint = str(categoria_id).strip()

    if categoria_nombre and str(categoria_nombre).lower() not in ('none', 'null'):
        nombre_hint = str(categoria_nombre).strip()

    qs = _qs_visibles(usuario, espacio, ambito)

    if pk is not None:
        cat = qs.filter(pk=pk).first()
        if cat is None:
            cat = Categoria.objects.filter(pk=pk).first()
            if cat is None:
                return {'error': f'No existe categoría con id={pk}'}
        return {'categoria_id': cat.pk, 'categoria_nombre': cat.nombre}

    if not nombre_hint:
        return {
            'error': 'Indica categoria_id (entero) o categoria_nombre (texto, ej. «Comida»).',
        }

    hits = _dedup_cats(_buscar_por_termino(qs, nombre_hint))

    if not hits:
        key = re.sub(r'[^\w\s]', '', _sin_tildes(nombre_hint), flags=re.UNICODE)
        for sinonimo in _SINONIMOS.get(key, ()):
            hits = _dedup_cats(_buscar_por_termino(qs, sinonimo))
            if hits:
                break
        if not hits:
            for cat in qs.order_by('nombre')[:200]:
                cat_key = _sin_tildes(cat.nombre)
                aliases = _SINONIMOS.get(key, ())
                if cat_key in aliases or key in _SINONIMOS.get(cat_key, ()):
                    hits.append(cat)
                elif any(len(a) >= 4 and (a in cat_key or cat_key in a) for a in aliases):
                    hits.append(cat)
                if len(hits) >= 5:
                    break
            hits = _dedup_cats(hits)

    if not hits:
        return _payload_sin_match(nombre_hint, qs)

    hits = _preferir_espacio(hits, espacio)

    if len(hits) > 1:
        needle = _sin_tildes(nombre_hint)
        exactos = [c for c in hits if _sin_tildes(c.nombre) == needle]
        if len(exactos) == 1:
            hits = exactos
        elif len(exactos) > 1:
            # Varias con el mismo nombre normalizado (p. ej. global + espacio)
            preferidas = _preferir_espacio(exactos, espacio)
            if len(preferidas) == 1:
                hits = preferidas
            elif len({_sin_tildes(c.nombre) for c in preferidas}) == 1:
                # Mismo nombre visible: tomar la del espacio o la primera
                locales = [c for c in preferidas if c.espacio_id == getattr(espacio, 'pk', None)]
                hits = [locales[0] if locales else preferidas[0]]
            else:
                return _payload_ambiguo(nombre_hint, preferidas)
        else:
            return _payload_ambiguo(nombre_hint, hits)

    cat = hits[0]
    return {'categoria_id': cat.pk, 'categoria_nombre': cat.nombre}
