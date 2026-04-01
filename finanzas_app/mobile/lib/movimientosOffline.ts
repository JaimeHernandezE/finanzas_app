import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient } from '@tanstack/react-query'
import { movimientosApi } from '@finanzas/shared/api/movimientos'

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
      data.map((m: any) => (m?.id === fromId ? { ...m, id: toId, _offline_pending: false } : m)),
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

export async function createMovimientoOfflineFirst(
  qc: QueryClient,
  payload: Record<string, unknown>,
) {
  try {
    const res = await movimientosApi.createMovimiento(payload)
    qc.invalidateQueries({ queryKey: ['movimientos'] })
    return { data: res.data, queued: false }
  } catch (error) {
    if (!isOfflineError(error)) throw error
    const localId = -Date.now()
    await enqueue({
      kind: 'create',
      local_id: localId,
      payload,
      created_at: Date.now(),
    })
    addMovimientoInCaches(qc, {
      id: localId,
      ...payload,
      categoria_nombre: 'Pendiente de sincronizar',
      _offline_pending: true,
    })
    return { data: { id: localId, ...payload }, queued: true }
  }
}

export async function patchMovimientoOfflineFirst(
  qc: QueryClient,
  id: number,
  payload: Record<string, unknown>,
) {
  try {
    const res = await movimientosApi.patchMovimiento(id, payload)
    updateMovimientoInCaches(qc, id, res.data as Record<string, unknown>)
    qc.invalidateQueries({ queryKey: ['movimientos'] })
    return { data: res.data, queued: false }
  } catch (error) {
    if (!isOfflineError(error)) throw error
    await enqueue({ kind: 'patch', id, payload, created_at: Date.now() })
    updateMovimientoInCaches(qc, id, { ...payload, _offline_pending: true })
    return { data: null, queued: true }
  }
}

export async function deleteMovimientoOfflineFirst(qc: QueryClient, id: number) {
  try {
    await movimientosApi.deleteMovimiento(id)
    removeMovimientoInCaches(qc, id)
    qc.invalidateQueries({ queryKey: ['movimientos'] })
    return { queued: false }
  } catch (error) {
    if (!isOfflineError(error)) throw error
    await enqueue({ kind: 'delete', id, created_at: Date.now() })
    removeMovimientoInCaches(qc, id)
    return { queued: true }
  }
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
  qc.invalidateQueries({ queryKey: ['movimientos'] })
}
