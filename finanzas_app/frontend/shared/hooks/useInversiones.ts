import { useQuery } from '@tanstack/react-query'
import { inversionesApi } from '../api/inversiones'

export function useFondos() {
  const q = useQuery({
    queryKey: ['fondos'],
    queryFn: () => inversionesApi.getFondos().then((r) => r.data),
    staleTime: 1000 * 60 * 10,
  })
  return {
    data: q.data ?? null,
    loading: q.isPending,
    error: q.error ? String(q.error) : null,
    refetch: q.refetch,
  }
}

export function useFondoDetalle(id: number) {
  const q = useQuery({
    queryKey: ['fondo', id],
    queryFn: () => inversionesApi.getFondo(id).then((r) => r.data),
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
