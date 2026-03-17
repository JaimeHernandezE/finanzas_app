// =============================================================================
// Tipos y datos mock — Viajes
// TODO: reemplazar por fetch al backend
// =============================================================================

export interface Viaje {
  id: string
  nombre: string
  fechaInicio: string // 'YYYY-MM-DD'
  fechaFin: string // 'YYYY-MM-DD'
  colorTema: string // hex, ej: '#2E86AB'
  esActivo: boolean
  archivado: boolean
}

export interface PresupuestoViaje {
  categoriaId: string
  categoriaNombre: string
  montoPresupuestado: number
  montoGastado: number // calculado on-the-fly desde movimientos con viaje=this.id
}

export interface MovimientoViaje {
  id: number
  fecha: string
  descripcion: string
  categoria: string
  monto: number
  autor: string
}

// TODO: reemplazar por fetch al backend
export const MOCK_VIAJES: Viaje[] = [
  {
    id: '1',
    nombre: 'Vacaciones Llanquihue 2026',
    fechaInicio: '2026-07-01',
    fechaFin: '2026-07-15',
    colorTema: '#2E86AB',
    esActivo: false,
    archivado: false,
  },
  {
    id: '2',
    nombre: 'Fin de semana Valdivia',
    fechaInicio: '2026-04-18',
    fechaFin: '2026-04-20',
    colorTema: '#c8f060',
    esActivo: false,
    archivado: false,
  },
  {
    id: '3',
    nombre: 'Viaje Santiago 2025',
    fechaInicio: '2025-11-01',
    fechaFin: '2025-11-05',
    colorTema: '#f060c8',
    esActivo: false,
    archivado: true,
  },
]

// TODO: reemplazar por fetch al backend (por viaje id)
export const MOCK_PRESUPUESTOS: PresupuestoViaje[] = [
  { categoriaId: '1', categoriaNombre: 'Pasajes', montoPresupuestado: 300000, montoGastado: 280000 },
  { categoriaId: '2', categoriaNombre: 'Alojamiento', montoPresupuestado: 400000, montoGastado: 420000 },
  { categoriaId: '3', categoriaNombre: 'Alimentación', montoPresupuestado: 150000, montoGastado: 87400 },
  { categoriaId: '4', categoriaNombre: 'Transporte', montoPresupuestado: 80000, montoGastado: 45000 },
  { categoriaId: '5', categoriaNombre: 'Actividades', montoPresupuestado: 100000, montoGastado: 0 },
]

// TODO: reemplazar por fetch al backend (por viaje id)
export const MOCK_MOVIMIENTOS_VIAJE: MovimientoViaje[] = [
  { id: 1, fecha: '2026-07-01', descripcion: 'Pasaje ida LAN', categoria: 'Pasajes', monto: 140000, autor: 'Jaime' },
  { id: 2, fecha: '2026-07-01', descripcion: 'Pasaje ida LAN Glori', categoria: 'Pasajes', monto: 140000, autor: 'Glori' },
  { id: 3, fecha: '2026-07-02', descripcion: 'Cabaña lago', categoria: 'Alojamiento', monto: 420000, autor: 'Jaime' },
  { id: 4, fecha: '2026-07-03', descripcion: 'Supermercado Osorno', categoria: 'Alimentación', monto: 52000, autor: 'Glori' },
  { id: 5, fecha: '2026-07-04', descripcion: 'Restaurant La Marca', categoria: 'Alimentación', monto: 35400, autor: 'Jaime' },
  { id: 6, fecha: '2026-07-05', descripcion: 'Bencina', categoria: 'Transporte', monto: 45000, autor: 'Jaime' },
]
