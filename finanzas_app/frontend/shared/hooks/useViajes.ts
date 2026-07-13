import { useQuery } from '@tanstack/react-query'
import { viajesApi } from '../api/viajes'

export function useViajes(archivado = false) {
  const q = useQuery({
    queryKey: ['viajes', archivado],
    queryFn: () => viajesApi.getViajes(archivado).then((r) => r.data),
    staleTime: 1000 * 60 * 10,
  })
  return {
    data: q.data ?? null,
    loading: q.isPending,
    error: q.error ? String(q.error) : null,
    refetch: q.refetch,
  }
}

export function useViajeDetalle(id: number) {
  const q = useQuery({
    queryKey: ['viaje', id],
    queryFn: () => viajesApi.getViaje(id).then((r) => r.data),
    enabled: id > 0,
    staleTime: 1000 * 60 * 10,
  })
  return {
    data: q.data ?? null,
    loading: q.isPending,
    error: q.error ? String(q.error) : null,
    refetch: q.refetch,
  }
}
