// Tipos y datos mock compartidos entre InversionesPage y FondoDetallePage.
// TODO: reemplazar por fetch al backend

export interface Fondo {
  id: string
  nombre: string
  descripcion: string
  esCompartido: boolean
  capitalTotal: number
  valorActual: number
}

export type TipoEvento = 'APORTE' | 'VALOR'

export interface EventoFondo {
  id: number
  tipo: TipoEvento
  fecha: string
  monto: number
  nota?: string
}

export const MOCK_FONDOS: Fondo[] = [
  { id: '1', nombre: 'Fondo Mutuo BCI', descripcion: 'Fondo renta variable', esCompartido: true, capitalTotal: 5000000, valorActual: 5980000 },
  { id: '2', nombre: 'Fondo Dólar Itaú', descripcion: 'Fondo en dólares', esCompartido: true, capitalTotal: 3500000, valorActual: 3840000 },
  { id: '3', nombre: 'Ahorro personal', descripcion: 'Depósito a plazo BCI', esCompartido: false, capitalTotal: 2000000, valorActual: 2100000 },
]
