/** Categoría tal como viene del listado API (incl. jerarquía). */
export interface CategoriaFiltroFila {
  id: number
  nombre: string
  categoria_padre: number | null
}

export type EstadoCheckboxPadre = 'checked' | 'indeterminate' | 'unchecked'

export function hijosDe(cats: CategoriaFiltroFila[], padreId: number): CategoriaFiltroFila[] {
  return cats.filter((c) => c.categoria_padre === padreId)
}

/** Padres primero (sin padre en el set o padre ausente), luego hijas ordenadas por nombre. */
export function filasCategoriasOrdenadas(
  cats: CategoriaFiltroFila[],
): Array<{ cat: CategoriaFiltroFila; depth: number }> {
  const byId = new Map(cats.map((c) => [c.id, c]))
  const roots = cats.filter((c) => !c.categoria_padre || !byId.has(c.categoria_padre))
  roots.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  const out: Array<{ cat: CategoriaFiltroFila; depth: number }> = []
  for (const p of roots) {
    out.push({ cat: p, depth: 0 })
    const hijos = hijosDe(cats, p.id).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    for (const h of hijos) {
      out.push({ cat: h, depth: 1 })
    }
  }
  return out
}

export function estadoGrupoCategoria(
  filtros: string[],
  cat: CategoriaFiltroFila,
  hijos: CategoriaFiltroFila[],
): EstadoCheckboxPadre {
  if (hijos.length === 0) {
    return filtros.includes(cat.nombre) ? 'checked' : 'unchecked'
  }
  const nombres = [cat.nombre, ...hijos.map((h) => h.nombre)]
  const marcados = nombres.filter((n) => filtros.includes(n)).length
  if (marcados === 0) return 'unchecked'
  if (marcados === nombres.length) return 'checked'
  return 'indeterminate'
}

/** Toggle: hoja alterna solo su nombre; padre marca/desmarca padre + todas las hijas. */
export function toggleCategoriaConJerarquia(
  prev: string[],
  cat: CategoriaFiltroFila,
  todas: CategoriaFiltroFila[],
): string[] {
  const hijos = hijosDe(todas, cat.id)
  if (hijos.length === 0) {
    return prev.includes(cat.nombre)
      ? prev.filter((x) => x !== cat.nombre)
      : [...prev, cat.nombre]
  }

  const nombresGrupo = [cat.nombre, ...hijos.map((h) => h.nombre)]
  const todosMarcados = nombresGrupo.every((n) => prev.includes(n))
  if (todosMarcados) {
    return prev.filter((x) => !nombresGrupo.includes(x))
  }
  const set = new Set(prev)
  for (const n of nombresGrupo) set.add(n)
  return [...set]
}
