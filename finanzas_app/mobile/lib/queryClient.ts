/**
 * QueryClient global + persister en AsyncStorage.
 *
 * Estrategia stale-while-revalidate:
 *  - Al abrir la app se muestran los datos cacheados (AsyncStorage) de inmediato.
 *  - En background, React Query revalida contra el servidor.
 *  - staleTime por entidad define cuánto tiempo se considera "fresco" el dato.
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
      // Datos considerados frescos durante 2 min por defecto.
      // Cada hook puede sobreescribir este valor.
      staleTime: 1000 * 60 * 2,
      // Cache en memoria por 24h → cubre toda una sesión de uso sin recargar.
      gcTime: UN_DIA_MS,
      // Un reintento es suficiente para errores de red momentáneos.
      retry: 1,
      // Revalidar al volver al foco (cambio de pantalla) y al reconectar.
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
})

export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'finanzas-rq-cache-v1',
  // Serializa/deserializa cada 1 s máximo para no bloquear el hilo principal.
  throttleTime: 1000,
})

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister,
  // Cache en disco válido por 24h. Si el usuario no abre la app en un día,
  // la próxima apertura descarta el cache y hace fetch fresco.
  maxAge: UN_DIA_MS,
  // Incrementar 'buster' fuerza invalidación del cache persistido en todos
  // los dispositivos (útil al cambiar la estructura de datos).
  buster: 'v1',
}
