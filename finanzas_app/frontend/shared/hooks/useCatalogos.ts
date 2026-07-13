import { useQuery } from '@tanstack/react-query'
import { catalogosApi } from '../api/catalogos'

// Los catálogos (categorías, métodos de pago, tarjetas) cambian muy poco.
// staleTime: Infinity → nunca se marcan como stale por tiempo; solo se
// refrescan manualmente (refetch) o al montar por primera vez sin cache.

interface CategoriasParams {
  ambito?: 'FAMILIAR' | 'PERSONAL'
  cuenta?: number
  tipo?: 'INGRESO' | 'EGRESO'
  solo_padres?: boolean
  solo_hijas?: boolean
}

export function useCategorias(params?: CategoriasParams) {
  const q = useQuery({
    queryKey: ['categorias', params ?? {}],
    queryFn: () => catalogosApi.getCategorias(params).then((r) => r.data),
    staleTime: Infinity,
  })
  return {
    data: q.data ?? null,
    loading: q.isPending,
    error: q.error ? String(q.error) : null,
    refetch: q.refetch,
  }
}

export function useMetodosPago() {
  const q = useQuery({
    queryKey: ['metodosPago'],
    queryFn: () => catalogosApi.getMetodosPago().then((r) => r.data),
    staleTime: Infinity,
  })
  return {
    data: q.data ?? null,
    loading: q.isPending,
    error: q.error ? String(q.error) : null,
    refetch: q.refetch,
  }
}

export function useTarjetas() {
  const q = useQuery({
    queryKey: ['tarjetas'],
    queryFn: () => catalogosApi.getTarjetas().then((r) => r.data),
    staleTime: 1000 * 60 * 30,
  })
  return {
    data: q.data ?? null,
    loading: q.isPending,
    error: q.error ? String(q.error) : null,
    refetch: q.refetch,
  }
}
