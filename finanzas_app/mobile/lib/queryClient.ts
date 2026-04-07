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
 *
 * Persistencia selectiva (dehydrate):
 *  En Android, AsyncStorage usa SQLite con CursorWindow ~2 MB por fila. Si el JSON
 *  del snapshot de React Query supera ese tamaño, multiGet falla con
 *  "Row too big to fit into CursorWindow". No persistimos listados masivos
 *  (movimientos, liquidación, etc.); siguen en memoria durante la sesión y se
 *  vuelven a pedir al abrir la app.
 */

import { QueryClient } from '@tanstack/react-query'
import { defaultShouldDehydrateQuery, type Query } from '@tanstack/query-core'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client'
import axios from 'axios'

const UN_DIA_MS = 1000 * 60 * 60 * 24

function isTransientServerError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false
  const status = error.response?.status
  return status != null && status >= 500 && status < 600
}

function isNetworkOrTimeoutError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false
  if (!error.response) return true
  return error.code === 'ECONNABORTED'
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      gcTime: UN_DIA_MS,
      // Retry inteligente:
      // - no reintenta timeout/red (offline-first, evita esperas largas)
      // - reintenta 1 vez solo para 5xx transitorios
      retry: (failureCount, error) => {
        if (isNetworkOrTimeoutError(error)) return false
        if (isTransientServerError(error)) return failureCount < 1
        return false
      },
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

/** Query keys cuyo `data` suele ser grande: no van a AsyncStorage (límite Android). */
const QUERY_KEYS_SIN_PERSISTENCIA = new Set<string>([
  'movimientos',
  'liquidacion',
  'presupuestoMes',
  'compensacion',
  'sueldosProrrateo',
  'viajes',
  'viaje',
  'fondos',
  'fondo',
])

function shouldDehydrateQuery(query: Query): boolean {
  if (!defaultShouldDehydrateQuery(query)) return false
  const root = query.queryKey[0]
  if (typeof root === 'string' && QUERY_KEYS_SIN_PERSISTENCIA.has(root)) return false
  return true
}

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister,
  maxAge: UN_DIA_MS,
  /** Subir buster si cambia la forma del snapshot o para limpiar caches corruptos. */
  buster: 'v3',
  dehydrateOptions: {
    shouldDehydrateQuery,
  },
}
