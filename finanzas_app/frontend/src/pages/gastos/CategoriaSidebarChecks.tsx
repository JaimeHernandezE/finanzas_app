import { useEffect, useMemo, useRef } from 'react'
import {
  estadoGrupoCategoria,
  filasCategoriasOrdenadas,
  hijosDe,
  type CategoriaFiltroFila,
} from './categoriasFiltroSidebar'

function FilaCheckbox({
  label,
  checked,
  indeterminate,
  className,
  onChange,
}: {
  label: string
  checked: boolean
  indeterminate: boolean
  className: string
  onChange: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])

  return (
    <label className={className}>
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={onChange}
      />
      {label}
    </label>
  )
}

type Props = {
  categorias: CategoriaFiltroFila[]
  filtrosCategorias: string[]
  onToggleCategoria: (cat: CategoriaFiltroFila) => void
  classNameItem: string
  classNameItemIndented: string
}

export function CategoriaSidebarChecks({
  categorias,
  filtrosCategorias,
  onToggleCategoria,
  classNameItem,
  classNameItemIndented,
}: Props) {
  const filas = useMemo(() => filasCategoriasOrdenadas(categorias), [categorias])

  return (
    <>
      {filas.map(({ cat, depth }) => {
        const hijos = hijosDe(categorias, cat.id)
        const estado = estadoGrupoCategoria(filtrosCategorias, cat, hijos)
        const checked = estado === 'checked'
        const indeterminate = estado === 'indeterminate'
        const cls = depth > 0 ? classNameItemIndented : classNameItem

        return (
          <FilaCheckbox
            key={cat.id}
            label={cat.nombre}
            checked={checked}
            indeterminate={indeterminate}
            className={cls}
            onChange={() => onToggleCategoria(cat)}
          />
        )
      })}
    </>
  )
}
