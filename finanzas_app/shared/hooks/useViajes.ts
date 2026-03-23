import { useApi } from './useApi'
import { viajesApi } from '../api/viajes'

export function useViajes(archivado = false) {
  return useApi(() => viajesApi.getViajes(archivado), [archivado])
}

export function useViajeDetalle(id: number) {
  return useApi(
    () => (id > 0 ? viajesApi.getViaje(id) : Promise.resolve({ data: null })),
    [id],
  )
}
