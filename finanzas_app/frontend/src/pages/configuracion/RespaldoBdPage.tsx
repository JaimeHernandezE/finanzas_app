import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '@/context/AuthContext'
import { backupBdApi } from '@/api'
import { apiErrorMessage } from '@/utils/apiErrorMessage'
import styles from './RespaldoBdPage.module.scss'

const CONFIRMACION_TEXTO = 'RESTAURAR_BD'

function parseFilenameFromContentDisposition(cd: string | undefined): string | null {
  if (!cd) return null
  const m = /filename\*?=(?:UTF-8''|")?([^";\n]+)/i.exec(cd)
  if (m?.[1]) return m[1].replace(/^"|"$/g, '')
  return null
}

function descargarBlob(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function RespaldoBdPage() {
  const { user } = useAuth()
  const [exportando, setExportando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [importando, setImportando] = useState(false)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [confirmTexto, setConfirmTexto] = useState('')
  const [msgOk, setMsgOk] = useState<string | null>(null)
  const [msgErr, setMsgErr] = useState<string | null>(null)

  if (user?.rol !== 'ADMIN') {
    return <Navigate to="/configuracion" replace />
  }

  const handleDescargar = async () => {
    setExportando(true)
    setMsgOk(null)
    setMsgErr(null)
    try {
      const res = await backupBdApi.descargarDump()
      const blob = res.data
      const name =
        parseFilenameFromContentDisposition(res.headers['content-disposition']) ??
        `finanzas_pg_${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}.sql.gz`
      descargarBlob(blob, name)
      setMsgOk('Descarga iniciada. Revisa la carpeta de descargas del navegador.')
    } catch (e: unknown) {
      setMsgErr(apiErrorMessage(e))
    } finally {
      setExportando(false)
    }
  }

  const handleSubirDrive = async () => {
    setSubiendo(true)
    setMsgOk(null)
    setMsgErr(null)
    try {
      const { data } = await backupBdApi.subirDumpADrive()
      setMsgOk(
        `Subido: ${data.archivo}. En Drive quedan como máximo los 2 respaldos más recientes (${data.eliminados_en_drive} archivo(s) antiguo(s) eliminado(s)).`
      )
    } catch (e: unknown) {
      setMsgErr(apiErrorMessage(e))
    } finally {
      setSubiendo(false)
    }
  }

  const handleImportar = async () => {
    if (!archivo) return
    setImportando(true)
    setMsgOk(null)
    setMsgErr(null)
    try {
      const { data } = await backupBdApi.importarDump(archivo, confirmTexto.trim())
      setMsgOk(data.mensaje ?? 'Importación completada.')
      setArchivo(null)
      setConfirmTexto('')
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        const d = e.response?.data as { error?: string; detail?: string }
        setMsgErr(d?.error ?? d?.detail ?? apiErrorMessage(e))
      } else {
        setMsgErr(apiErrorMessage(e))
      }
    } finally {
      setImportando(false)
    }
  }

  const puedeImportar =
    archivo &&
    confirmTexto.trim() === CONFIRMACION_TEXTO &&
    !importando

  return (
    <div className={`${styles.page} ${styles.fadeUp}`}>
      <Link to="/configuracion" className={styles.backLink}>
        ← Configuración
      </Link>
      <h1 className={styles.titulo}>Respaldo PostgreSQL</h1>

      <p className={styles.advertencia}>
        Solo administradores. Los archivos son volcados en formato SQL plano comprimido (.sql.gz), compatibles
        con la importación de esta misma pantalla. La importación <strong>reemplaza por completo</strong> los
        datos actuales de la base de datos.
      </p>

      <section className={styles.card}>
        <h2 className={styles.cardTitulo}>Exportar</h2>
        <p className={styles.descripcion}>
          Descarga un respaldo al equipo o súbelo a la carpeta de Google Drive configurada en el servidor
          (se conservan solo los dos archivos más recientes con prefijo finanzas_pg_).
        </p>
        <div className={styles.acciones}>
          <button
            type="button"
            className={styles.btnPrimario}
            disabled={exportando}
            onClick={() => void handleDescargar()}
          >
            {exportando ? 'Generando…' : 'Descargar .sql.gz'}
          </button>
          <button
            type="button"
            className={styles.btnSecundario}
            disabled={subiendo}
            onClick={() => void handleSubirDrive()}
          >
            {subiendo ? 'Subiendo…' : 'Subir a Google Drive'}
          </button>
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitulo}>Importar (peligroso)</h2>
        <p className={styles.descripcion}>
          Sube un .sql.gz generado desde esta app. Escribe <code>{CONFIRMACION_TEXTO}</code> en el campo de
          confirmación.
        </p>
        <input
          type="file"
          accept=".gz,application/gzip"
          className={styles.inputFile}
          disabled={importando}
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
        />
        <input
          type="text"
          className={styles.inputConfirm}
          placeholder={`Escribe ${CONFIRMACION_TEXTO}`}
          value={confirmTexto}
          disabled={importando}
          onChange={(e) => setConfirmTexto(e.target.value)}
          autoComplete="off"
        />
        <div className={styles.acciones}>
          <button
            type="button"
            className={styles.btnPrimario}
            disabled={!puedeImportar}
            onClick={() => void handleImportar()}
          >
            {importando ? 'Restaurando…' : 'Restaurar base de datos'}
          </button>
        </div>
      </section>

      {msgOk ? <p className={styles.resultadoOk}>{msgOk}</p> : null}
      {msgErr ? <p className={styles.resultadoError}>{msgErr}</p> : null}
    </div>
  )
}
