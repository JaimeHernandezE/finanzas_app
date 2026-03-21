import { useState, useEffect, useCallback } from 'react'
import { movimientosApi, type MovimientoFiltros } from '../api/movimientos'

export function useMovimientos(filtros: MovimientoFiltros = {}) {
  const [movimientos, setMovimientos] = useState<unknown[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await movimientosApi.getMovimientos(filtros)
      setMovimientos(Array.isArray(res.data) ? res.data : [])
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } }
      setError(ax.response?.data?.error ?? 'Error al cargar movimientos.')
    } finally {
      setLoading(false)
    }
  }, [
    filtros.cuenta,
    filtros.ambito,
    filtros.mes,
    filtros.anio,
    filtros.tipo,
    filtros.categoria,
    filtros.metodo,
    filtros.q,
  ])

  useEffect(() => {
    cargar()
  }, [cargar])

  const eliminar = useCallback(async (id: number) => {
    await movimientosApi.deleteMovimiento(id)
    setMovimientos((prev) => prev.filter((m) => (m as { id?: number }).id !== id))
  }, [])

  return { movimientos, loading, error, refetch: cargar, eliminar }
}
