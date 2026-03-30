import client from './client'

/** Respuesta de GET /api/finanzas/cuentas-personales/ */
export interface CuentaPersonalApi {
  id: number
  nombre: string
  descripcion: string
  visible_familia: boolean
  es_propia: boolean
  duenio_nombre: string | null
}

export interface PresupuestoMesFila {
  presupuesto_id: number | null
  categoria_id: number
  categoria_nombre: string
  monto_presupuestado: string | null
  gastado: number
}

export interface ImportacionCuentaPersonalResult {
  ok: boolean
  dry_run: boolean
  movimientos_creados: number
  movimientos_anteriores_eliminados: number
  categorias_personales_creadas: number
  cuenta_objetivo: string
}

export interface ImportacionSueldosResult {
  ok: boolean
  dry_run: boolean
  ingresos_creados: number
  ingresos_anteriores_eliminados: number
  filas_omitidas_otros_integrantes: number
}

export interface ImportacionGastosComunesResult {
  ok: boolean
  dry_run: boolean
  movimientos_creados: number
  categorias_familiares_creadas: number
  ambito_objetivo: 'COMUN'
}

export interface RecalculoHistoricoResult {
  ok: boolean
  procesado: boolean
  detalle?: string
  desde?: string
  hasta?: string
  /** Meses con snapshot persistido (ResumenHistoricoMesSnapshot) */
  meses_resumen_historico_familia?: number
  /** Meses recalculados en saldos por cuenta del usuario autenticado */
  meses_saldos_personales_usuario?: number
}

/** GET/PUT /api/finanzas/sueldos-estimados-prorrateo/ */
export interface SueldosEstimadosProrrateoResp {
  mes: number
  anio: number
  /** usuario_id (string) → monto decimal */
  montos: Record<string, string>
}

export interface ResumenHistoricoMes {
  mes: number
  anio: number
  gasto_comun_total: string
  gastos_comunes_por_usuario: { usuario_id: number; nombre: string; total: string }[]
  sueldos_por_usuario: { usuario_id: number; nombre: string; total: string }[]
  prorrateo_por_usuario: {
    usuario_id: number
    nombre: string
    porcentaje: string
    ingreso_comun_mes: string
  }[]
  gasto_comun_prorrateado_por_usuario: { usuario_id: number; nombre: string; total: string }[]
  compensacion: {
    por_usuario: {
      usuario_id: number
      nombre: string
      pagado_efectivo: string
      gasto_prorrateado: string
      diferencia: string
    }[]
    transferencias_sugeridas: {
      de_usuario_id: number
      de_nombre: string
      a_usuario_id: number
      a_nombre: string
      monto: string
    }[]
  }
  base_prorrateo: { mes: number; anio: number; nota: string }
}

export const finanzasApi = {
  getCuentasPersonales: () =>
    client.get<CuentaPersonalApi[]>('/api/finanzas/cuentas-personales/'),

  createCuentaPersonal: (data: {
    nombre: string
    descripcion?: string
    visible_familia?: boolean
  }) => client.post<CuentaPersonalApi>('/api/finanzas/cuentas-personales/', data),

  updateCuentaPersonal: (
    id: number,
    data: Partial<{ nombre: string; descripcion: string; visible_familia: boolean }>,
  ) => client.patch<CuentaPersonalApi>(`/api/finanzas/cuentas-personales/${id}/`, data),

  deleteCuentaPersonal: (id: number) =>
    client.delete(`/api/finanzas/cuentas-personales/${id}/`),

  getIngresosComunes: (filtros: { mes?: number; anio?: number } = {}) =>
    client.get('/api/finanzas/ingresos-comunes/', { params: filtros }),

  createIngresoComun: (data: { mes: string; fecha_pago?: string; monto: string; origen: string }) =>
    client.post('/api/finanzas/ingresos-comunes/', data),

  updateIngresoComun: (
    id: number,
    data: Partial<{ fecha_pago: string; monto: string; origen: string }>,
  ) =>
    client.put(`/api/finanzas/ingresos-comunes/${id}/`, data),

  deleteIngresoComun: (id: number) =>
    client.delete(`/api/finanzas/ingresos-comunes/${id}/`),

  getLiquidacion: (mes: number, anio: number) =>
    client.get<{
      periodo: { mes: number; anio: number }
      ingresos: { usuario_id: number; nombre: string; total: string }[]
      gastos_comunes: { usuario_id: number; nombre: string; total: string }[]
      recalculo?: { pendiente: boolean; dirty_from: string | null }
    }>('/api/finanzas/liquidacion/', { params: { mes, anio } }),

  getResumenHistorico: () =>
    client.get<{
      meses: ResumenHistoricoMes[]
      recalculo: { pendiente: boolean; dirty_from: string | null }
    }>('/api/finanzas/resumen-historico/'),

  /** Efectivo neto por cuenta (snapshot); coherente con ediciones en mes actual/anterior */
  getSaldoMensual: (mes: number, anio: number) =>
    client.get<{
      mes: number
      anio: number
      cuentas: {
        cuenta_id: number
        nombre: string
        efectivo: string
        ingresos: string
        egresos: string
      }[]
      recalculo: { pendiente: boolean; dirty_from: string | null }
    }>('/api/finanzas/saldo-mensual/', { params: { mes, anio } }),

  /** Ingresos / egresos / neto por mes para una cuenta personal */
  getCuentaResumenMensual: (cuentaId: number) =>
    client.get<{
      cuenta: { id: number; nombre: string }
      meses: {
        mes: number
        anio: number
        ingresos: string
        egresos: string
        efectivo_neto: string
      }[]
      recalculo: { pendiente: boolean; dirty_from: string | null }
    }>('/api/finanzas/cuenta-resumen-mensual/', { params: { cuenta: cuentaId } }),

  /** Base para compensación con sueldos estimados (saldo proyectado) */
  getCompensacionProyectada: (mes: number, anio: number) =>
    client.get<{
      periodo: { mes: number; anio: number }
      neto_familiar_comun: string
      miembros: {
        usuario_id: number
        nombre: string
        neto_comun_mes: string
        ingreso_declarado_mes: string
      }[]
    }>('/api/finanzas/compensacion-proyectada/', { params: { mes, anio } }),

  /** Sueldos base para prorrateo (persistidos por mes; se limpian meses viejos al guardar) */
  getSueldosEstimadosProrrateo: (mes: number, anio: number) =>
    client.get<SueldosEstimadosProrrateoResp>('/api/finanzas/sueldos-estimados-prorrateo/', {
      params: { mes, anio },
    }),

  putSueldosEstimadosProrrateo: (mes: number, anio: number, montos: Record<string, string>) =>
    client.put<SueldosEstimadosProrrateoResp>(
      '/api/finanzas/sueldos-estimados-prorrateo/',
      { montos },
      { params: { mes, anio } },
    ),

  /** Efectivo dashboard; desglose A–E (A+B+C−D+E) para depuración */
  getEfectivoDisponible: () =>
    client.get<{
      efectivo: string
      personal_historico: string
      comun_movimientos_historico: string
      prorrateo_gastos_comunes_acumulado: string
      desglose: {
        a: string
        b: string
        c: string
        d: string
        e: string
        e_personal: string
        e_comun: string
      }
      recalculo: { pendiente: boolean; dirty_from: string | null }
    }>('/api/finanzas/efectivo-disponible/'),

  recalcularHistorico: () =>
    client.post<RecalculoHistoricoResult>('/api/finanzas/recalculo/historico/'),

  /** Filas categoría + presupuesto/gastado del mes */
  getPresupuestoMes: (params: { mes: number; anio: number; ambito: 'FAMILIAR' | 'PERSONAL'; cuenta?: number }) =>
    client.get<PresupuestoMesFila[]>('/api/finanzas/presupuesto-mes/', { params }),

  createPresupuesto: (data: {
    categoria: number
    mes: string
    monto: string
    ambito: 'FAMILIAR' | 'PERSONAL'
  }) => client.post('/api/finanzas/presupuestos/', data),

  patchPresupuesto: (id: number, data: { monto: string }) =>
    client.patch(`/api/finanzas/presupuestos/${id}/`, data),

  deletePresupuesto: (id: number) => client.delete(`/api/finanzas/presupuestos/${id}/`),

  importarCuentaPersonalPlanilla: (archivo: File, dryRun = true) => {
    const form = new FormData()
    form.append('archivo', archivo)
    form.append('dry_run', String(dryRun))
    return client.post<ImportacionCuentaPersonalResult>(
      '/api/finanzas/importaciones/cuenta-personal/',
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
  },

  importarHonorariosPlanilla: (archivo: File, dryRun = true) => {
    const form = new FormData()
    form.append('archivo', archivo)
    form.append('dry_run', String(dryRun))
    return client.post<ImportacionCuentaPersonalResult>(
      '/api/finanzas/importaciones/honorarios/',
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
  },

  importarSueldosPlanilla: (archivo: File, dryRun = true) => {
    const form = new FormData()
    form.append('archivo', archivo)
    form.append('dry_run', String(dryRun))
    return client.post<ImportacionSueldosResult>(
      '/api/finanzas/importaciones/sueldos/',
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
  },

  importarGastosComunesPlanilla: (archivo: File, dryRun = true) => {
    const form = new FormData()
    form.append('archivo', archivo)
    form.append('dry_run', String(dryRun))
    return client.post<ImportacionGastosComunesResult>(
      '/api/finanzas/importaciones/gastos-comunes/',
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
  },
}
