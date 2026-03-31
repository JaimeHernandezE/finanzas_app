// Tipos compartidos entre web y mobile

export interface Usuario {
  id:     number
  uid?:   string
  email:  string
  nombre: string
  foto:   string | null
  rol:    string
  familia: { id: number; nombre: string } | null
}

export interface Familia {
  id:     number
  nombre: string
}

export interface Categoria {
  id:          number
  nombre:      string
  tipo:        'INGRESO' | 'EGRESO'
  es_inversion: boolean
  familia:     number | null
  usuario:     number | null
  cuenta_personal: number | null
  categoria_padre: number | null
  es_padre: boolean
}

export interface MetodoPago {
  id:     number
  nombre: string
  tipo:   'EFECTIVO' | 'DEBITO' | 'CREDITO'
}

export interface Tarjeta {
  id:              number
  nombre:          string
  banco:           string
  dia_facturacion: number | null
  dia_vencimiento: number | null
  usuario:         number
}

export interface CuentaPersonal {
  id:              number
  nombre:          string
  descripcion:     string
  visible_familia: boolean
  es_propia:       boolean
  duenio_nombre?:  string
}

export interface Cuota {
  id:              number
  numero:          number
  monto:           number
  mes_facturacion: string
  estado:          'PENDIENTE' | 'FACTURADO' | 'PAGADO'
  incluir:         boolean
}

export interface Movimiento {
  id:          number
  fecha:       string
  tipo:        'INGRESO' | 'EGRESO'
  ambito:      'PERSONAL' | 'COMUN'
  categoria:   number
  cuenta:      number | null
  monto:       number
  comentario:  string
  oculto:      boolean
  metodo_pago: number
  tarjeta:     number | null
  num_cuotas:  number | null
  monto_cuota: number | null
  viaje:       number | null
  cuotas:      Cuota[]
  created_at:  string
  ingreso_comun: number | null
}

export interface IngresoComun {
  id:      number
  familia: number
  usuario: number
  mes:     string
  monto:   number
  origen:  string
}

export interface Presupuesto {
  id:        number
  familia:   number
  usuario:   number | null
  categoria: number
  mes:       string
  monto:     number
}

export interface Fondo {
  id:          number
  nombre:      string
  descripcion: string
  familia:     number
}

/** Modelo API / Django (tabla Viaje) */
export interface Viaje {
  id:          number
  nombre:      string
  destino:     string
  fecha_inicio: string
  fecha_fin:   string
  activo:      boolean
  familia:     number
}

/** Viaje mapeado para UI (selector / mobile), alineado con el web */
export interface ViajeLista {
  id:          string
  nombre:      string
  fechaInicio: string
  fechaFin:    string
  colorTema:   string
  esActivo:    boolean
  archivado:   boolean
}
