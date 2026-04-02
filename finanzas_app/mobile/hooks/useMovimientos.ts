import { useEffect } from 'react'
import NetInfo from '@react-native-community/netinfo'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { movimientosApi, type MovimientoFiltros } from '@finanzas/shared/api/movimientos'
import {
  deleteMovimientoOptimistic,
  flushMovimientosOutbox,
} from '../lib/movimientosOffline'

export function useMovimientos(filtros: MovimientoFiltros = {}) {
  const qc = useQueryClient()
  const queryKey = ['movimientos', filtros] as const

  useEffect(() => {
    void flushMovimientosOutbox(qc)
  }, [qc])

  useEffect(() => {
    const sub = NetInfo.addEventListener((state) => {
      if (state.isConnected) void flushMovimientosOutbox(qc)
    })
    return () => {
      sub()
    }
  }, [qc])

  const q = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await movimientosApi.getMovimientos(filtros)
      return res.data
    },
    staleTime: Infinity,
  })

  const eliminar = async (id: number) => {
    await deleteMovimientoOptimistic(qc, id)
  }

  return {
    movimientos: (q.data as unknown[]) ?? [],
    /** Primera carga con fetch activo; no confundir con refetch en background. */
    loading: q.isLoading,
    error: q.error ? String(q.error) : null,
    refetch: q.refetch,
    eliminar,
  }
}
