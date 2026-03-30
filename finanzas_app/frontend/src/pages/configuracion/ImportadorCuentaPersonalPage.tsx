import { useState } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import { finanzasApi } from '@/api'
import styles from './ImportadorCuentaPersonalPage.module.scss'

type ResultadoOk = {
  ok: boolean
  dry_run: boolean
  movimientos_creados: number
  movimientos_anteriores_eliminados: number
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

export default function ImportadorCuentaPersonalPage() {
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
      const { data } = await finanzasApi.importarCuentaPersonalPlanilla(archivo, dryRun)
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
      <h1 className={styles.titulo}>Importar cuenta personal</h1>

      <section className={styles.card}>
        <p className={styles.descripcion}>
          Sube un archivo CSV con encabezados: Fecha, Mes/año, Categoría, Monto, Descripción, ID gasto.
          Se ignoran Mes/año e ID gasto.
        </p>
        <ul className={styles.reglas}>
          <li>
            Cada importación sustituye los movimientos de efectivo en la cuenta «Personal» (no borra
            ingresos vinculados a sueldos declarados ni movimientos con débito o tarjeta).
          </li>
          <li>Si una categoría no existe, se crea como categoría personal.</li>
          <li>Si el monto es negativo, se guarda como Ingreso en categoría Otros.</li>
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
          <p>Movimientos anteriores sustituidos: {resultado.movimientos_anteriores_eliminados}</p>
          <p>Categorías personales creadas: {resultado.categorias_personales_creadas}</p>
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
          {typeof detalleError.categorias_personales_creadas === 'number' && (
            <p>Categorías personales creadas: {detalleError.categorias_personales_creadas}</p>
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
