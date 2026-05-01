/**
 * Tipos y utilidades alineados con la web (CategoriasPage.tsx).
 */

export interface CategoriaUIModel {
  id: string
  nombre: string
  tipo: 'INGRESO' | 'EGRESO'
  esInversion: boolean
  ambito: 'GLOBAL' | 'FAMILIAR' | 'PERSONAL'
  cuentaPersonal: number | null
  categoriaPadre: number | null
  esPadre: boolean
}

export function mapApiToCategoria(c: {
  id: number
  nombre: string
  tipo: string
  es_inversion?: boolean
  familia?: number | null
  usuario?: number | null
  cuenta_personal?: number | null
  categoria_padre?: number | null
  es_padre?: boolean
}): CategoriaUIModel {
  const ambito: CategoriaUIModel['ambito'] =
    !c.familia && !c.usuario ? 'GLOBAL' : c.familia && !c.usuario ? 'FAMILIAR' : 'PERSONAL'
  return {
    id: String(c.id),
    nombre: c.nombre,
    tipo: c.tipo as 'INGRESO' | 'EGRESO',
    esInversion: !!c.es_inversion,
    ambito,
    cuentaPersonal: c.cuenta_personal ?? null,
    categoriaPadre: c.categoria_padre ?? null,
    esPadre: !!c.es_padre,
  }
}

/** Orden: padres alfabético; bajo cada padre, hijas alfabético. */
export function buildJerarquiaCategorias(
  lista: CategoriaUIModel[],
): { c: CategoriaUIModel; esHija: boolean }[] {
  const ids = new Set(lista.map((c) => c.id))
  const hijosPorPadre = new Map<string, CategoriaUIModel[]>()
  for (const c of lista) {
    if (c.categoriaPadre != null && ids.has(String(c.categoriaPadre))) {
      const pid = String(c.categoriaPadre)
      if (!hijosPorPadre.has(pid)) hijosPorPadre.set(pid, [])
      hijosPorPadre.get(pid)!.push(c)
    }
  }
  hijosPorPadre.forEach((arr) =>
    arr.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })),
  )
  const raices = lista
    .filter((c) => c.categoriaPadre == null || !ids.has(String(c.categoriaPadre)))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))
  const out: { c: CategoriaUIModel; esHija: boolean }[] = []
  const walk = (c: CategoriaUIModel, esHija: boolean) => {
    out.push({ c, esHija })
    for (const h of hijosPorPadre.get(c.id) ?? []) walk(h, true)
  }
  for (const r of raices) walk(r, false)
  return out
}
