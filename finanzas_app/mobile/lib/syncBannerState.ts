import type { QueryClient } from '@tanstack/react-query'

export const SYNC_BANNER_QUERY_KEY = ['movimientoSyncBanner'] as const

export type SyncBannerPhase = 'hidden' | 'syncing' | 'synced' | 'offline' | 'error'

export type SyncBannerData = { phase: SyncBannerPhase }

let hideTimer: ReturnType<typeof setTimeout> | null = null

function clearHideTimer() {
  if (hideTimer != null) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

export function setSyncBannerPhase(qc: QueryClient, phase: SyncBannerPhase) {
  clearHideTimer()
  qc.setQueryData<SyncBannerData>(SYNC_BANNER_QUERY_KEY, { phase })
}

/**
 * Tras mostrar synced/offline/error, oculta el banner con retraso.
 */
export function scheduleSyncBannerHide(qc: QueryClient, delayMs = 1800) {
  clearHideTimer()
  hideTimer = setTimeout(() => {
    qc.setQueryData<SyncBannerData>(SYNC_BANNER_QUERY_KEY, { phase: 'hidden' })
    hideTimer = null
  }, delayMs)
}
