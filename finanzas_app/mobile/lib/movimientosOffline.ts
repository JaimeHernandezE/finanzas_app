import AsyncStorage from '@react-native-async-storage/async-storage'
import { Alert } from 'react-native'
import { QueryClient } from '@tanstack/react-query'
import { movimientosApi } from '@finanzas/shared/api/movimientos'
import { invalidateFinanzasTrasMovimiento } from './invalidateFinanzasTrasMovimiento'
import {
  scheduleSyncBannerHide,
  setSyncBannerPhase,
} from './syncBannerState'

const OUTBOX_KEY = 'finanzas-movimientos-outbox-v1'

type OutboxItem =
  | {
      kind: 'create'
      local_id: number
      payload: Record<string, unknown>
      created_at: number
    }
  | {
      kind: 'patch'
      id: number
      payload: Record<string, unknown>
      created_at: number
    }
  | {
      kind: 'delete'
      id: number
      created_at: number
    }

function isOfflineError(error: unknown): boolean {
  const e = error as { response?: unknown; message?: string }
  if (e?.response) return false
  const msg = String(e?.message ?? '').toLowerCase()
  return (
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('failed to fetch') ||
    msg.includes('request failed')
  )
}

async function readOutbox(): Promise<OutboxItem[]> {
  const raw = await AsyncStorage.getItem(OUTBOX_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as OutboxItem[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function writeOutbox(items: OutboxItem[]) {
  await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(items))
}

async function enqueue(item: OutboxItem) {
  const items = await readOutbox()
  items.push(item)
  await writeOutbox(items)
}

async function removeCreateFromOutbox(localId: number) {
  const items = await readOutbox()
  const next = items.filter((i) => !(i.kind === 'create' && i.local_id === localId))
  await writeOutbox(next)
}

function updateMovimientoInCaches(qc: QueryClient, id: number, patch: Record<string, unknown>) {
  const entries = qc.getQueriesData({ queryKey: ['movimientos'] })
  for (const [key, data] of entries) {
    if (!Array.isArray(data)) continue
    const next = data.map((m: any) => (m?.id === id ? { ...m, ...patch } : m))
    qc.setQueryData(key, next)
  }
}

function removeMovimientoInCaches(qc: QueryClient, id: number) {
  const entries = qc.getQueriesData({ queryKey: ['movimientos'] })
  for (const [key, data] of entries) {
    if (!Array.isArray(data)) continue
    qc.setQueryData(
      key,
      data.filter((m: any) => m?.id !== id),
    )
  }
}

function replaceMovimientoIdInCaches(qc: QueryClient, fromId: number, toId: number) {
  const entries = qc.getQueriesData({ queryKey: ['movimientos'] })
  for (const [key, data] of entries) {
    if (!Array.isArray(data)) continue
    qc.setQueryData(
      key,
      data.map((m: any) =>
        m?.id === fromId
          ? { ...m, id: toId, _offline_pending: false, _sync_pending: false }
          : m,
      ),
    )
  }
}

function addMovimientoInCaches(qc: QueryClient, mov: Record<string, unknown>) {
  const entries = qc.getQueriesData({ queryKey: ['movimientos'] })
  for (const [key, data] of entries) {
    if (!Array.isArray(data)) continue
    qc.setQueryData(key, [mov, ...data])
  }
}

function extractErrorMessage(error: unknown): string {
  const ax = error as { response?: { data?: Record<string, string[] | string> } }
  const data = ax.response?.data
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const msg = Object.values(data)
      .map((v) => (Array.isArray(v) ? v.join(' ') : String(v)))
      .join(' ')
    if (msg.trim()) return msg
  }
  return 'No se pudo guardar el movimiento.'
}

/** Id negativo = pendiente de alta en servidor (optimistic / cola). */
export function movimientoIdEsTemporal(id: number): boolean {
  return !Number.isFinite(id) || id < 0
}

export type DisplayMovimientoOptimista = {
  categoria_nombre: string
  metodo_pago_tipo: 'EFECTIVO' | 'DEBITO' | 'CREDITO'
}

/**
 * Crea en cache al instante y sincroniza en segundo plano.
 * Muestra el banner superior (Sincronizando → Sincronizado).
 */
export function createMovimientoOptimistic(
  qc: QueryClient,
  payload: Record<string, unknown>,
  display: DisplayMovimientoOptimista,
): number {
  const localId = -Date.now()
  const montoNum = Number(payload.monto)
  const row: Record<string, unknown> = {
    id: localId,
    ...payload,
    monto: Number.isFinite(montoNum) ? montoNum : payload.monto,
    categoria_nombre: display.categoria_nombre,
    metodo_pago_tipo: display.metodo_pago_tipo,
    _sync_pending: true,
    _offline_pending: false,
  }
  addMovimientoInCaches(qc, row)
  setSyncBannerPhase(qc, 'syncing')

  void (async () => {
    try {
      const res = await movimientosApi.createMovimiento(payload)
      const remoteId = Number((res.data as { id?: number })?.id)
      if (Number.isFinite(remoteId)) {
        replaceMovimientoIdInCaches(qc, localId, remoteId)
        const server = res.data as Record<string, unknown>
        updateMovimientoInCaches(qc, remoteId, { ...server, _sync_pending: false })
      }
      invalidateFinanzasTrasMovimiento(qc)
      setSyncBannerPhase(qc, 'synced')
      scheduleSyncBannerHide(qc, 2000)
    } catch (error) {
      if (isOfflineError(error)) {
        await enqueue({
          kind: 'create',
          local_id: localId,
          payload,
          created_at: Date.now(),
        })
        updateMovimientoInCaches(qc, localId, {
          _offline_pending: true,
          _sync_pending: false,
          categoria_nombre: 'Pendiente de sincronizar',
        })
        invalidateFinanzasTrasMovimiento(qc)
        setSyncBannerPhase(qc, 'offline')
        scheduleSyncBannerHide(qc, 3500)
      } else {
        removeMovimientoInCaches(qc, localId)
        invalidateFinanzasTrasMovimiento(qc)
        Alert.alert('Error', extractErrorMessage(error))
        setSyncBannerPhase(qc, 'error')
        scheduleSyncBannerHide(qc, 3500)
      }
    }
  })()

  return localId
}

/**
 * Actualiza cache al instante y hace PATCH en segundo plano.
 */
export function patchMovimientoOptimistic(
  qc: QueryClient,
  id: number,
  payload: Record<string, unknown>,
  optimisticRowPatch: Record<string, unknown>,
) {
  if (movimientoIdEsTemporal(id)) {
    throw new Error('Este movimiento aún se está sincronizando.')
  }
  updateMovimientoInCaches(qc, id, optimisticRowPatch)
  void (async () => {
    try {
      const res = await movimientosApi.patchMovimiento(id, payload)
      updateMovimientoInCaches(qc, id, res.data as Record<string, unknown>)
      invalidateFinanzasTrasMovimiento(qc)
    } catch (error) {
      if (isOfflineError(error)) {
        await enqueue({ kind: 'patch', id, payload, created_at: Date.now() })
        updateMovimientoInCaches(qc, id, { ...payload, _offline_pending: true })
      } else {
        invalidateFinanzasTrasMovimiento(qc)
        Alert.alert('Error', extractErrorMessage(error))
      }
    }
  })()
}

/**
 * Quita de cache al instante y DELETE en segundo plano (o cola si falla red).
 */
export async function deleteMovimientoOptimistic(qc: QueryClient, id: number) {
  if (movimientoIdEsTemporal(id)) {
    await removeCreateFromOutbox(id)
    removeMovimientoInCaches(qc, id)
    invalidateFinanzasTrasMovimiento(qc)
    return
  }
  removeMovimientoInCaches(qc, id)
  void (async () => {
    try {
      await movimientosApi.deleteMovimiento(id)
      invalidateFinanzasTrasMovimiento(qc)
    } catch (error) {
      if (isOfflineError(error)) {
        await enqueue({ kind: 'delete', id, created_at: Date.now() })
      } else {
        // Restaurar lista desde servidor
        invalidateFinanzasTrasMovimiento(qc)
        Alert.alert('Error', 'No se pudo eliminar el movimiento.')
      }
    }
  })()
}

export async function flushMovimientosOutbox(qc: QueryClient) {
  const items = await readOutbox()
  if (!items.length) return

  const pending: OutboxItem[] = []
  const idMap = new Map<number, number>()

  for (const item of items) {
    try {
      if (item.kind === 'create') {
        const res = await movimientosApi.createMovimiento(item.payload)
        const remoteId = Number((res.data as any)?.id)
        if (Number.isFinite(remoteId)) {
          idMap.set(item.local_id, remoteId)
          replaceMovimientoIdInCaches(qc, item.local_id, remoteId)
        }
        continue
      }

      const mappedId = idMap.get(item.id) ?? item.id
      if (item.kind === 'patch') {
        await movimientosApi.patchMovimiento(mappedId, item.payload)
        continue
      }
      await movimientosApi.deleteMovimiento(mappedId)
    } catch (error) {
      if (isOfflineError(error)) {
        pending.push(item)
        continue
      }
      // Error de validación/permisos: se descarta para no bloquear toda la cola.
    }
  }

  await writeOutbox(pending)
  invalidateFinanzasTrasMovimiento(qc)
}
