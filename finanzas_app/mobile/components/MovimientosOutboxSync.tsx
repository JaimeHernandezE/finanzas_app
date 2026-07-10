import { useEffect } from 'react'
import NetInfo from '@react-native-community/netinfo'
import { useQueryClient } from '@tanstack/react-query'
import { scheduleFlushMovimientosOutbox } from '../lib/movimientosOffline'

/**
 * Un solo listener global para vaciar la cola offline.
 * Antes cada useMovimientos() registraba el suyo → en MIUI podían ejecutarse
 * varios flush en paralelo y duplicar movimientos en el servidor.
 */
export function MovimientosOutboxSync() {
  const qc = useQueryClient()

  useEffect(() => {
    scheduleFlushMovimientosOutbox(qc)

    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const sub = NetInfo.addEventListener((state) => {
      if (!state.isConnected) return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        scheduleFlushMovimientosOutbox(qc)
      }, 600)
    })

    return () => {
      sub()
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [qc])

  return null
}
