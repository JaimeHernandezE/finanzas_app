import type { QueryClient } from '@tanstack/react-query'

export type InvalidarFinanzasOpts = {
  /** Solo invalida la lista de movimientos (p. ej. refresco mínimo). */
  soloMovimientos?: boolean
}

/**
 * Invalida caches afectados por crear/editar/eliminar movimientos.
 * Centraliza las claves que antes se repetían en formulario, dashboard y outbox.
 */
export function invalidateFinanzasTrasMovimiento(
  qc: QueryClient,
  opts?: InvalidarFinanzasOpts,
): void {
  void qc.invalidateQueries({ queryKey: ['movimientos'] })
  if (opts?.soloMovimientos) return
  void qc.invalidateQueries({ queryKey: ['efectivoDisponible'] })
  void qc.invalidateQueries({ queryKey: ['deudaPendiente'] })
  void qc.invalidateQueries({ queryKey: ['liquidacion'] })
  void qc.invalidateQueries({ queryKey: ['presupuestoMes'] })
  void qc.invalidateQueries({ queryKey: ['compensacion'] })
}
