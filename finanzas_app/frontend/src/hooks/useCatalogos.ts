import { useApi } from './useApi'
import { catalogosApi } from '../api/catalogos'

interface CategoriasParams {
  ambito?: 'FAMILIAR' | 'PERSONAL'
  cuenta?: number
  tipo?: 'INGRESO' | 'EGRESO'
  solo_padres?: boolean
  solo_hijas?: boolean
}

export function useCategorias(params?: CategoriasParams) {
  const deps = [JSON.stringify(params ?? {})]
  return useApi(() => catalogosApi.getCategorias(params), deps)
}

export function useMetodosPago() {
  return useApi(() => catalogosApi.getMetodosPago())
}

export function useTarjetas() {
  return useApi(() => catalogosApi.getTarjetas())
}
