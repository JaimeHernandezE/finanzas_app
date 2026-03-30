import { useState, useMemo } from 'react'
import { useApi } from '@/hooks/useApi'
import { finanzasApi } from '@/api'
import { Cargando, ErrorCarga, InputMontoClp } from '@/components/ui'
import { montoClpANumero } from '@/utils/montoClp'
import { useAuth } from '@/context/AuthContext'
import { useConfig } from '@/context/ConfigContext'
import styles from './SueldosPage.module.scss'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos (API: id, mes, monto, origen, usuario, autor_nombre)
// ─────────────────────────────────────────────────────────────────────────────

interface IngresoMes {
  id: number
  usuarioId: string
  nombre: string
  origen: string
  monto: number
  mes: number
  anio: number
  fechaIso: string
  fechaPagoIso: string
}

const COLORES_MIEMBRO = ['#c8f060', '#60c8f0', '#f060c8', '#f0c860']

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const pct = (n: number) => `${n.toFixed(1)}%`

const formatearFecha = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return 'Fecha no disponible'
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
}

const parseMesAnio = (valorMes: string | undefined, fallbackMes: number, fallbackAnio: number) => {
  if (!valorMes) return { mes: fallbackMes, anio: fallbackAnio }

  const match = /^(\d{4})-(\d{2})/.exec(valorMes)
  if (match) {
    const anioNum = Number(match[1])
    const mesNum = Number(match[2]) - 1
    return {
      mes: Number.isFinite(mesNum) ? Math.max(0, Math.min(11, mesNum)) : fallbackMes,
      anio: Number.isFinite(anioNum) ? anioNum : fallbackAnio,
    }
  }

  // Fallback para formatos distintos, evitando romper render si el backend cambia.
  const d = new Date(valorMes)
  if (Number.isNaN(d.getTime())) return { mes: fallbackMes, anio: fallbackAnio }
  return { mes: d.getMonth(), anio: d.getFullYear() }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────────────────────────

function SeccionCabecera({
  titulo,
  right,
}: {
  titulo: string
  right?: React.ReactNode
}) {
  return (
    <div className={styles.seccionCabecera}>
      <p className={styles.seccionTitulo}>{titulo}</p>
      {right != null && <div className={styles.seccionCabeceraRight}>{right}</div>}
    </div>
  )
}

function ResumenBarRow({
  nombre,
  total,
  porcentaje,
  color,
  delay = 0,
}: {
  nombre: string
  total: number
  porcentaje: number
  color: string
  delay?: number
}) {
  const { formatMonto } = useConfig()
  return (
    <div className={styles.barRow}>
      <span className={styles.barNombre}>{nombre}</span>
      <div className={styles.barTrack}>
        <div
          className={styles.barFill}
          style={
            {
              '--target-width': `${porcentaje}%`,
              backgroundColor: color,
              animationDelay: `${delay}ms`,
            } as React.CSSProperties
          }
        />
      </div>
      <span className={styles.barTotal}>{formatMonto(total)}</span>
      <span className={styles.barPct}>{pct(porcentaje)}</span>
    </div>
  )
}

function FilaTotalFamiliar({ monto }: { monto: number }) {
  const { formatMonto } = useConfig()
  return (
    <div className={styles.filaTotalFamiliar}>
      <span className={styles.filaTotalLabel}>Total familiar</span>
      <span className={styles.filaTotalMonto}>{formatMonto(monto)}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────────────────

export default function SueldosPage() {
  const { formatMonto } = useConfig()
  const hoy = new Date()
  const mesActual = hoy.getMonth()
  const anioActual = hoy.getFullYear()
  const [mes, setMes] = useState(hoy.getMonth())
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mostrarFormNuevo, setMostrarFormNuevo] = useState(false)
  const [editandoId, setEditandoId] = useState<number | null>(null)

  const { data: ingresosRaw, loading, error, refetch } = useApi(
    () => finanzasApi.getIngresosComunes({ mes: mes + 1, anio }),
    [mes, anio],
  )

  const { user } = useAuth()
  const usuarioActualId = user ? String(user.id) : ''

  const ingresos: IngresoMes[] = useMemo(() => {
    const list = (ingresosRaw ?? []) as {
      id: number
      mes: string
      fecha_pago?: string | null
      monto: string
      origen: string
      usuario: number
      autor_nombre: string
    }[]
    return list.map(i => {
      const { mes, anio } = parseMesAnio(i.mes, mesActual, anioActual)
      const fechaPagoIso = i.fecha_pago || `${anio}-${String(mes + 1).padStart(2, '0')}-01`
      return {
        id: i.id,
        usuarioId: String(i.usuario),
        nombre: i.autor_nombre ?? '',
        origen: i.origen,
        monto: Number(i.monto) || 0,
        mes,
        anio,
        fechaIso: fechaPagoIso,
        fechaPagoIso,
      }
    })
  }, [ingresosRaw, mesActual, anioActual])

  const esActual = mes === hoy.getMonth() && anio === hoy.getFullYear()

  const irAnterior = () => {
    if (mes === 0) {
      setMes(11)
      setAnio(a => a - 1)
    } else {
      setMes(m => m - 1)
    }
  }

  const irSiguiente = () => {
    if (esActual) return
    if (mes === 11) {
      setMes(0)
      setAnio(a => a + 1)
    } else {
      setMes(m => m + 1)
    }
  }

  const miembros = useMemo(() => {
    const byId = new Map<string, { id: string; nombre: string }>()
    for (const i of ingresos) {
      if (!byId.has(i.usuarioId)) byId.set(i.usuarioId, { id: i.usuarioId, nombre: i.nombre })
    }
    return Array.from(byId.values())
  }, [ingresos])

  const ingresosMes = useMemo(
    () => ingresos.filter(i => i.mes === mes && i.anio === anio),
    [ingresos, mes, anio],
  )

  const porUsuario = useMemo(() => {
    return miembros.map(m => ({
      ...m,
      ingresos: ingresosMes.filter(i => i.usuarioId === m.id),
      total: ingresosMes.filter(i => i.usuarioId === m.id).reduce((s, i) => s + i.monto, 0),
    }))
  }, [miembros, ingresosMes])

  const totalFamiliar = useMemo(
    () => porUsuario.reduce((s, m) => s + m.total, 0),
    [porUsuario]
  )

  const misIngresos = useMemo(
    () => ingresosMes.filter(i => i.usuarioId === usuarioActualId),
    [ingresosMes, usuarioActualId]
  )

  const otrosMiembros = useMemo(
    () => miembros.filter(m => m.id !== usuarioActualId),
    [miembros, usuarioActualId]
  )

  const agregar = async (origen: string, monto: number, fechaPagoIso: string) => {
    const mesStr = `${anio}-${String(mes + 1).padStart(2, '0')}-01`
    await finanzasApi.createIngresoComun({
      mes: mesStr,
      fecha_pago: fechaPagoIso,
      monto: String(monto),
      origen: origen.trim(),
    })
    setMostrarFormNuevo(false)
    refetch()
  }

  const actualizar = async (id: number, origen: string, monto: number, fechaPagoIso: string) => {
    await finanzasApi.updateIngresoComun(id, {
      fecha_pago: fechaPagoIso,
      origen: origen.trim(),
      monto: String(monto),
    })
    setEditandoId(null)
    refetch()
  }

  const eliminar = async (id: number) => {
    await finanzasApi.deleteIngresoComun(id)
    setEditandoId(null)
    refetch()
  }

  const conPorcentaje = useMemo(
    () =>
      porUsuario.map(m => ({
        ...m,
        porcentaje: totalFamiliar > 0 ? (m.total / totalFamiliar) * 100 : 0,
      })),
    [porUsuario, totalFamiliar],
  )

  if (loading) return <Cargando />
  if (error) return <ErrorCarga mensaje={error} />

  return (
    <div className={styles.page}>
      {/* ── Encabezado ── */}
      <div className={styles.header}>
        <h1 className={styles.titulo}>Sueldos</h1>
        <div className={styles.mesNav}>
          <button className={styles.mesBtn} onClick={irAnterior} aria-label="Mes anterior">
            ‹
          </button>
          <span className={styles.mesLabel}>{MESES[mes]} {anio}</span>
          <button
            className={styles.mesBtn}
            onClick={irSiguiente}
            disabled={esActual}
            aria-label="Mes siguiente"
          >
            ›
          </button>
        </div>
      </div>

      {/* ── Resumen del mes ── */}
      <section className={styles.seccion}>
        <SeccionCabecera titulo="RESUMEN DEL MES" />
        {totalFamiliar === 0 ? (
          <p className={styles.resumenVacio}>Sin ingresos declarados para este mes</p>
        ) : (
          <>
            {conPorcentaje.map((m, i) => (
              <ResumenBarRow
                key={m.id}
                nombre={m.nombre}
                total={m.total}
                porcentaje={m.porcentaje}
                color={COLORES_MIEMBRO[i % COLORES_MIEMBRO.length]}
                delay={i * 60}
              />
            ))}
            <FilaTotalFamiliar monto={totalFamiliar} />
          </>
        )}
      </section>

      {/* ── Mis ingresos ── */}
      <section className={styles.seccion}>
        <SeccionCabecera
          titulo="MIS INGRESOS"
          right={
            <button
              type="button"
              className={styles.btnAgregar}
              onClick={() => { setEditandoId(null); setMostrarFormNuevo(true); }}
            >
              + Agregar
            </button>
          }
        />
        {mostrarFormNuevo && (
          <FormNuevoIngreso
            onGuardar={agregar}
            fechaInicialIso={`${anio}-${String(mes + 1).padStart(2, '0')}-01`}
            onCancelar={() => setMostrarFormNuevo(false)}
          />
        )}
        {misIngresos.length === 0 && !mostrarFormNuevo ? (
          <div className={styles.misIngresosVacio}>
            <p>Sin ingresos declarados</p>
            <button
              type="button"
              className={styles.linkAbrirForm}
              onClick={() => { setEditandoId(null); setMostrarFormNuevo(true); }}
            >
              Agrega tu primer ingreso del mes →
            </button>
          </div>
        ) : (
          <ul className={styles.listaIngresos}>
            {misIngresos.map(ing =>
              editandoId === ing.id ? (
                <FilaEdicion
                  key={ing.id}
                  ingreso={ing}
                  onGuardar={(origen, monto, fechaPagoIso) => actualizar(ing.id, origen, monto, fechaPagoIso)}
                  onCancelar={() => setEditandoId(null)}
                />
              ) : (
                <FilaIngreso
                  key={ing.id}
                  ingreso={ing}
                  onEditar={() => { setMostrarFormNuevo(false); setEditandoId(ing.id); }}
                  onEliminar={() => eliminar(ing.id)}
                />
              )
            )}
          </ul>
        )}
      </section>

      {/* ── Ingresos de otros miembros ── */}
      {otrosMiembros.map(m => {
        const lista = ingresosMes.filter(i => i.usuarioId === m.id)
        return (
          <section key={m.id} className={styles.seccion}>
            <SeccionCabecera titulo={`INGRESOS DE ${m.nombre.toUpperCase()}`} />
            {lista.length === 0 ? (
              <p className={styles.otroVacio}>
                {m.nombre} aún no ha declarado ingresos para este mes
              </p>
            ) : (
              <ul className={styles.listaIngresosSoloLectura}>
                {lista.map(ing => (
                  <li key={ing.id} className={styles.filaSoloLectura}>
                    <div className={styles.filaContenido}>
                      <span className={styles.filaOrigen}>{ing.origen}</span>
                      <span className={styles.filaMeta}>
                        <span className={styles.filaUsuario}>{ing.nombre || 'Sin nombre'}</span>
                        <span aria-hidden="true">•</span>
                        <span className={styles.filaFecha}>{formatearFecha(ing.fechaIso)}</span>
                      </span>
                    </div>
                    <span className={styles.filaMonto}>{formatMonto(ing.monto)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Formulario nuevo ingreso y filas (inline)
// ─────────────────────────────────────────────────────────────────────────────

function FormNuevoIngreso({
  onGuardar,
  fechaInicialIso,
  onCancelar,
}: {
  onGuardar: (origen: string, monto: number, fechaPagoIso: string) => void
  fechaInicialIso: string
  onCancelar: () => void
}) {
  const [origen, setOrigen] = useState('')
  const [montoStr, setMontoStr] = useState('')
  const [fechaPagoIso, setFechaPagoIso] = useState(fechaInicialIso)

  const monto = montoClpANumero(montoStr)
  const valido = origen.trim() !== '' && monto > 0 && !!fechaPagoIso

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!valido) return
    onGuardar(origen.trim(), monto, fechaPagoIso)
    setOrigen('')
    setMontoStr('')
    setFechaPagoIso(fechaInicialIso)
  }

  return (
    <form className={styles.formInline} onSubmit={handleSubmit}>
      <input
        type="text"
        className={styles.inputOrigen}
        placeholder="Ej: Sueldo, Honorarios, Arriendo"
        value={origen}
        onChange={e => setOrigen(e.target.value)}
        autoFocus
      />
      <InputMontoClp
        soloInput
        inputClassName={styles.sueldoMontoInput}
        value={montoStr}
        onChange={setMontoStr}
        aria-label="Monto"
      />
      <input
        type="date"
        className={styles.fechaPagoInput}
        value={fechaPagoIso}
        onChange={e => setFechaPagoIso(e.target.value)}
        aria-label="Fecha de pago"
      />
      <button type="submit" className={styles.btnIcon} disabled={!valido} title="Guardar">
        ✓
      </button>
      <button type="button" className={styles.btnIcon} onClick={onCancelar} title="Cancelar">
        ✕
      </button>
    </form>
  )
}

function FilaIngreso({
  ingreso,
  onEditar,
  onEliminar,
}: {
  ingreso: IngresoMes
  onEditar: () => void
  onEliminar: () => void
}) {
  const { formatMonto } = useConfig()
  return (
    <li className={styles.filaIngreso}>
      <div className={styles.filaContenido}>
        <span className={styles.filaOrigen}>{ingreso.origen}</span>
        <span className={styles.filaMeta}>
          <span className={styles.filaUsuario}>{ingreso.nombre || 'Sin nombre'}</span>
          <span aria-hidden="true">•</span>
          <span className={styles.filaFecha}>{formatearFecha(ingreso.fechaIso)}</span>
        </span>
      </div>
      <span className={styles.filaMonto}>{formatMonto(ingreso.monto)}</span>
      <button type="button" className={styles.btnIcon} onClick={onEditar} title="Editar">
        ✎
      </button>
      <button type="button" className={styles.btnIcon} onClick={onEliminar} title="Eliminar">
        🗑
      </button>
    </li>
  )
}

function FilaEdicion({
  ingreso,
  onGuardar,
  onCancelar,
}: {
  ingreso: IngresoMes
  onGuardar: (origen: string, monto: number, fechaPagoIso: string) => void
  onCancelar: () => void
}) {
  const [origen, setOrigen] = useState(ingreso.origen)
  const [montoStr, setMontoStr] = useState(String(ingreso.monto))
  const [fechaPagoIso, setFechaPagoIso] = useState(ingreso.fechaPagoIso)

  const monto = montoClpANumero(montoStr)
  const valido = origen.trim() !== '' && monto > 0 && !!fechaPagoIso

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!valido) return
    onGuardar(origen.trim(), monto, fechaPagoIso)
  }

  return (
    <li className={styles.filaIngreso}>
      <form className={styles.formInline} onSubmit={handleSubmit}>
        <input
          type="text"
          className={styles.inputOrigen}
          value={origen}
          onChange={e => setOrigen(e.target.value)}
          autoFocus
        />
        <InputMontoClp
          soloInput
          inputClassName={styles.sueldoMontoInput}
          value={montoStr}
          onChange={setMontoStr}
          aria-label="Monto"
        />
        <input
          type="date"
          className={styles.fechaPagoInput}
          value={fechaPagoIso}
          onChange={e => setFechaPagoIso(e.target.value)}
          aria-label="Fecha de pago"
        />
        <button type="submit" className={styles.btnIcon} disabled={!valido} title="Guardar">
          ✓
        </button>
        <button type="button" className={styles.btnIcon} onClick={onCancelar} title="Cancelar">
          ✕
        </button>
      </form>
    </li>
  )
}
