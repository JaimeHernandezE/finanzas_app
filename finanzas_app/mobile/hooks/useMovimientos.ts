import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { movimientosApi, type MovimientoFiltros } from '@finanzas/shared/api/movimientos'
import {
  deleteMovimientoOfflineFirst,
  flushMovimientosOutbox,
} from '../lib/movimientosOffline'

export function useMovimientos(filtros: MovimientoFiltros = {}) {
  const qc = useQueryClient()
  const queryKey = ['movimientos', filtros] as const

  useEffect(() => {
    void flushMovimientosOutbox(qc)
  }, [qc])

  const q = useQuery({
    queryKey,
    queryFn: async () => {
      await flushMovimientosOutbox(qc)
      const res = await movimientosApi.getMovimientos(filtros)
      return res.data
    },
    staleTime: 1000 * 60 * 2,
  })

  const eliminar = async (id: number) => {
    await deleteMovimientoOfflineFirst(qc, id)
  }

  return {
    movimientos: (q.data as unknown[]) ?? [],
    loading: q.isPending,
    error: q.error ? String(q.error) : null,
    refetch: q.refetch,
    eliminar,
  }
}
