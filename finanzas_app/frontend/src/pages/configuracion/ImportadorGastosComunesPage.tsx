import { useState } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import { finanzasApi } from '@/api'
import styles from './ImportadorGastosComunesPage.module.scss'

type ResultadoOk = {
  ok: boolean
  dry_run: boolean
  movimientos_creados: number
  categorias_familiares_creadas: number
  ambito_objetivo: 'COMUN'
}

type ResultadoError = {
  error?: string
  errores?: string[]
  movimientos_validos?: number
  categorias_familiares_creadas?: number
  dry_run?: boolean
}

export default function ImportadorGastosComunesPage() {
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
      const { data } = await finanzasApi.importarGastosComunesPlanilla(archivo, dryRun)
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
      <h1 className={styles.titulo}>Importar gastos comunes</h1>

      <section className={styles.card}>
        <p className={styles.descripcion}>
          Sube un CSV con encabezados: Fecha, Mes/año, Categoría, Monto, Descripción, ID gasto.
        </p>
        <ul className={styles.reglas}>
          <li>Se ignoran Mes/año e ID gasto.</li>
          <li>Se crea movimiento con ámbito COMÚN.</li>
          <li>Si categoría no existe, se crea como categoría familiar.</li>
          <li>Si monto es negativo, se guarda como Ingreso en categoría Otros.</li>
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
          <p>Movimientos creados: {resultado.movimientos_creados}</p>
          <p>Categorías familiares creadas: {resultado.categorias_familiares_creadas}</p>
          <p>Ámbito objetivo: {resultado.ambito_objetivo}</p>
        </section>
      )}

      {detalleError && (
        <section className={styles.resultadoError}>
          <h2>Error en importación</h2>
          <p>{detalleError.error ?? 'No se pudo importar la planilla.'}</p>
          {typeof detalleError.movimientos_validos === 'number' && (
            <p>Filas válidas hasta el error: {detalleError.movimientos_validos}</p>
          )}
          {typeof detalleError.categorias_familiares_creadas === 'number' && (
            <p>Categorías familiares creadas: {detalleError.categorias_familiares_creadas}</p>
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
