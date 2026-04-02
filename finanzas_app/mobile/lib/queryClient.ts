/**
 * QueryClient global + persister en AsyncStorage.
 *
 * Estrategia offline-first:
 *  - staleTime: Infinity → los datos nunca se marcan stale por tiempo.
 *    Solo se invalidan explícitamente tras mutaciones o pull-to-refresh.
 *  - Al abrir la app se muestran los datos cacheados (AsyncStorage) al instante,
 *    sin ninguna llamada a la red si ya hay cache.
 *  - refetchOnWindowFocus: false → navegar entre pantallas NO dispara refetch.
 *  - refetchOnReconnect: true → al recuperar red se sincroniza en background.
 *  - gcTime (24h) mantiene el cache en memoria entre navegaciones.
 *  - maxAge del persister (24h) descarta snapshots más viejos al arrancar.
 */

import { QueryClient } from '@tanstack/react-query'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client'

const UN_DIA_MS = 1000 * 60 * 60 * 24

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      gcTime: UN_DIA_MS,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
})

export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'finanzas-rq-cache-v1',
  throttleTime: 1000,
})

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister,
  maxAge: UN_DIA_MS,
  buster: 'v2',
}
