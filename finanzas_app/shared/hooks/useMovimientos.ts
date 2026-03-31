import { useQuery, useQueryClient } from '@tanstack/react-query'
import { movimientosApi, type MovimientoFiltros } from '../api/movimientos'

/**
 * staleTime corto (2 min) porque los movimientos se crean con frecuencia.
 * Al eliminar: actualiza el cache optimistamente e invalida en background
 * para que otras vistas con distintos filtros también se refresquen.
 */
export function useMovimientos(filtros: MovimientoFiltros = {}) {
  const qc = useQueryClient()
  const queryKey = ['movimientos', filtros] as const

  const q = useQuery({
    queryKey,
    queryFn: () => movimientosApi.getMovimientos(filtros).then((r) => r.data),
    staleTime: 1000 * 60 * 2,
  })

  const eliminar = async (id: number) => {
    await movimientosApi.deleteMovimiento(id)
    // Actualización optimista: saca el item del cache actual sin esperar refetch
    qc.setQueryData<unknown[]>(queryKey, (prev) =>
      prev?.filter((m: any) => m.id !== id) ?? [],
    )
    // Invalida todas las variantes de movimientos para mantener consistencia
    qc.invalidateQueries({ queryKey: ['movimientos'] })
  }

  return {
    movimientos: (q.data as unknown[]) ?? [],
    loading: q.isPending,
    error: q.error ? String(q.error) : null,
    refetch: q.refetch,
    eliminar,
  }
}
