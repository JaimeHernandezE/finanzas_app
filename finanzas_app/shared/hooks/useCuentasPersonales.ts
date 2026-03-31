import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/context/AuthContext'
import { finanzasApi, type CuentaPersonalApi } from '@/api/finanzas'

/**
 * Cuentas propias + tuteladas del usuario autenticado.
 * Sin sesión (enabled: false) no hace fetch y devuelve lista vacía.
 */
export function useCuentasPersonales() {
  const { user } = useAuth()
  const q = useQuery<CuentaPersonalApi[]>({
    queryKey: ['cuentasPersonales', user?.email ?? ''],
    queryFn: () => finanzasApi.getCuentasPersonales().then((r) => r.data),
    enabled: !!user,
    staleTime: 1000 * 60 * 30,
  })
  return {
    data: q.data ?? null,
    loading: q.isPending,
    error: q.error ? String(q.error) : null,
    refetch: q.refetch,
  }
}
