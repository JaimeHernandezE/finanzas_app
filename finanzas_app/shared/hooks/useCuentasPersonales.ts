import { useAuth } from '@/context/AuthContext'
import { finanzasApi, type CuentaPersonalApi } from '@/api/finanzas'
import { useApi } from './useApi'

/**
 * Cuentas propias + tuteladas del usuario autenticado.
 * Sin sesión devuelve lista vacía (no llama al API).
 */
export function useCuentasPersonales() {
  const { user } = useAuth()
  return useApi<CuentaPersonalApi[]>(
    async () => {
      if (!user) return { data: [] }
      return finanzasApi.getCuentasPersonales()
    },
    [user?.email ?? ''],
  )
}
