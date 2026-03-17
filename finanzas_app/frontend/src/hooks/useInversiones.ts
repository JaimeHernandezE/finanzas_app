import { useApi } from './useApi'
import { inversionesApi } from '../api/inversiones'

export function useFondos() {
  return useApi(() => inversionesApi.getFondos())
}

export function useFondoDetalle(id: number) {
  return useApi(() => inversionesApi.getFondo(id), [id])
}
