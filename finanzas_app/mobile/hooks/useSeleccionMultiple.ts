import { useCallback, useEffect, useMemo, useState } from 'react'
import { BackHandler } from 'react-native'

/**
 * Selección múltiple de ítems por id.
 * - `activarCon` entra al modo y selecciona el id.
 * - `toggle` alterna; si queda vacío, sale del modo.
 * - Back de Android limpia la selección mientras está activa.
 * - `idsVisibles` elimina del set los ids que ya no están en la lista.
 */
export function useSeleccionMultiple(idsVisibles?: readonly number[]) {
  const [ids, setIds] = useState<Set<number>>(() => new Set())

  const activa = ids.size > 0

  const limpiar = useCallback(() => {
    setIds(new Set())
  }, [])

  const activarCon = useCallback((id: number) => {
    setIds((prev) => {
      if (prev.has(id) && prev.size === 1) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const toggle = useCallback((id: number) => {
    setIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const tiene = useCallback((id: number) => ids.has(id), [ids])

  const onLongPressItem = useCallback(
    (id: number) => {
      setIds((prev) => {
        if (prev.size === 0) return new Set([id])
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    },
    [],
  )

  useEffect(() => {
    if (!activa) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      limpiar()
      return true
    })
    return () => sub.remove()
  }, [activa, limpiar])

  const visiblesKey =
    idsVisibles == null
      ? null
      : idsVisibles.length === 0
        ? ''
        : [...idsVisibles].sort((a, b) => a - b).join(',')

  useEffect(() => {
    if (visiblesKey == null) return
    const visibles = new Set(
      visiblesKey === '' ? [] : visiblesKey.split(',').map((s) => Number(s)),
    )
    setIds((prev) => {
      if (prev.size === 0) return prev
      let changed = false
      const next = new Set<number>()
      for (const id of prev) {
        if (visibles.has(id)) next.add(id)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [visiblesKey])

  return useMemo(
    () => ({
      activa,
      ids,
      activarCon,
      toggle,
      onLongPressItem,
      limpiar,
      tiene,
      cantidad: ids.size,
    }),
    [activa, ids, activarCon, toggle, onLongPressItem, limpiar, tiene],
  )
}
