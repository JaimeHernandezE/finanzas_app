import { useState } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import { finanzasApi } from '@/api'
import styles from './ImportadorCuentaPersonalPage.module.scss'

type ResultadoOk = {
  ok: boolean
  dry_run: boolean
  movimientos_creados: number
  categorias_personales_creadas: number
  cuenta_objetivo: string
}

type ResultadoError = {
  error?: string
  errores?: string[]
  movimientos_validos?: number
  categorias_personales_creadas?: number
  dry_run?: boolean
}

export default function ImportadorHonorariosPage() {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [procesando, setProcesando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoOk | null>(null)
  const [detalleError, setDetalleError] = useState<ResultadoError | null>(null)

  const ejecutarImportacion = async (dryRun: boolean) => {
    if (!archivo) return
    setProcesando(true)
    setResultado(null)
    setDetalleError(null)
    try {
      const { data } = await finanzasApi.importarHonorariosPlanilla(archivo, dryRun)
      setResultado(data)
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setDetalleError((error.response?.data as ResultadoError) ?? { error: 'Error inesperado.' })
      } else {
        setDetalleError({ error: 'Error inesperado.' })
      }
    } finally {
      setProcesando(false)
    }
  }

  return (
    <div className={`${styles.page} ${styles.fadeUp}`}>
      <Link to="/configuracion" className={styles.backLink}>← Configuración</Link>
      <h1 className={styles.titulo}>Importar honorarios</h1>

      <section className={styles.card}>
        <p className={styles.descripcion}>
          Sube un CSV con columnas: Fecha, Mes/año, Gasto, Ingreso, Entrada, Valor, Monto, Descripción, ID entrada.
          El sistema usa <strong>Valor</strong> como monto y decide tipo por <strong>Gasto/Ingreso</strong>.
        </p>
        <ul className={styles.reglas}>
          <li>Si la columna Gasto tiene contenido, se guarda como EGRESO.</li>
          <li>Si la columna Ingreso tiene contenido, se guarda como INGRESO.</li>
          <li>La cuenta objetivo es “Honorarios”.</li>
        </ul>

        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          disabled={procesando}
        />

        <div className={styles.acciones}>
          <button
            type="button"
            onClick={() => ejecutarImportacion(true)}
            disabled={!archivo || procesando}
            className={styles.btnSecundario}
          >
            Validar (dry-run)
          </button>
          <button
            type="button"
            onClick={() => ejecutarImportacion(false)}
            disabled={!archivo || procesando}
            className={styles.btnPrimario}
          >
            Importar
          </button>
        </div>
      </section>

      {resultado && (
        <section className={styles.resultadoOk}>
          <h2>Resultado</h2>
          <p>Estado: {resultado.dry_run ? 'Validación (sin guardar)' : 'Importación aplicada'}</p>
          <p>Movimientos procesados: {resultado.movimientos_creados}</p>
          <p>Categorías creadas: {resultado.categorias_personales_creadas}</p>
          <p>Cuenta objetivo: {resultado.cuenta_objetivo}</p>
        </section>
      )}

      {detalleError && (
        <section className={styles.resultadoError}>
          <h2>Error en importación</h2>
          <p>{detalleError.error ?? 'No se pudo importar la planilla.'}</p>
          {typeof detalleError.movimientos_validos === 'number' && (
            <p>Filas válidas hasta el error: {detalleError.movimientos_validos}</p>
          )}
          {!!detalleError.errores?.length && (
            <ul className={styles.listaErrores}>
              {detalleError.errores.slice(0, 20).map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
