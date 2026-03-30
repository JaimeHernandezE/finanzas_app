import { useState } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import { finanzasApi } from '@/api'
import styles from './ImportadorSueldosPage.module.scss'

type ResultadoOk = {
  ok: boolean
  dry_run: boolean
  ingresos_creados: number
  ingresos_anteriores_eliminados: number
  filas_omitidas_otros_integrantes: number
}

type ResultadoError = {
  error?: string
  errores?: string[]
  ingresos_validos?: number
  dry_run?: boolean
}

export default function ImportadorSueldosPage() {
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
      const { data } = await finanzasApi.importarSueldosPlanilla(archivo, dryRun)
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
      <h1 className={styles.titulo}>Importar sueldos</h1>

      <section className={styles.card}>
        <p className={styles.descripcion}>
          Sube un CSV con encabezados: Integrante, día, Mes/año, Sueldo, Descripción, ID entrada.
        </p>
        <ul className={styles.reglas}>
          <li>Se mapea a IngresoComun solo para tu usuario: cada importación borra tus ingresos comunes anteriores y deja solo lo del archivo.</li>
          <li>Las filas cuyo integrante sea otro miembro de la familia se omiten.</li>
          <li>día se usa para determinar el mes (guardado como primer día del mes).</li>
          <li>Sueldo se importa como monto y Descripción como origen.</li>
          <li>ID entrada se ignora.</li>
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
          <p>Ingresos creados: {resultado.ingresos_creados}</p>
          <p>Ingresos anteriores sustituidos: {resultado.ingresos_anteriores_eliminados}</p>
          {resultado.filas_omitidas_otros_integrantes > 0 && (
            <p>Filas omitidas (otro integrante): {resultado.filas_omitidas_otros_integrantes}</p>
          )}
        </section>
      )}

      {detalleError && (
        <section className={styles.resultadoError}>
          <h2>Error en importación</h2>
          <p>{detalleError.error ?? 'No se pudo importar la planilla.'}</p>
          {typeof detalleError.ingresos_validos === 'number' && (
            <p>Filas válidas hasta el error: {detalleError.ingresos_validos}</p>
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
