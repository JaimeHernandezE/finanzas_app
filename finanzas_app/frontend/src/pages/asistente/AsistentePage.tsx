import { useCallback, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { finanzasApi } from '@/api'
import type { AsistenteHistorialItem } from '@/api/finanzas'
import { Button } from '@/components/ui'
import { apiErrorMessage } from '@/utils/apiErrorMessage'
import styles from './AsistentePage.module.scss'

const MAX_HISTORIAL = 8

const EJEMPLOS = [
  '¿Cómo voy con mis presupuestos este mes?',
  '¿Me avisaste alguna alerta de presupuesto?',
  '¿Cómo cerramos el mes pasado en el común?',
] as const

type MensajeChat = {
  id: string
  role: 'user' | 'assistant'
  content: string
  herramientas?: string[]
  sugerencias?: string[]
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default function AsistentePage() {
  const [mensajes, setMensajes] = useState<MensajeChat[]>([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listaRef = useRef<HTMLDivElement>(null)

  const scrollAlFinal = () => {
    requestAnimationFrame(() => {
      listaRef.current?.scrollTo({ top: listaRef.current.scrollHeight, behavior: 'smooth' })
    })
  }

  const enviar = useCallback(async (mensajeRaw: string) => {
    const mensaje = mensajeRaw.trim()
    if (!mensaje || enviando) return

    setError(null)
    setTexto('')
    const userMsg: MensajeChat = { id: uid(), role: 'user', content: mensaje }
    setMensajes((prev) => [...prev, userMsg])
    setEnviando(true)
    scrollAlFinal()

    const historial: AsistenteHistorialItem[] = [...mensajes, userMsg]
      .slice(-MAX_HISTORIAL)
      .map((m) => ({ role: m.role, content: m.content }))
    // El turno actual va en `mensaje`; el historial son turnos previos.
    const historialPrevio = historial.slice(0, -1)

    try {
      const { data } = await finanzasApi.consultarAsistente(mensaje, historialPrevio)
      const asistenteMsg: MensajeChat = {
        id: uid(),
        role: 'assistant',
        content: data.respuesta,
        herramientas: data.herramientas_usadas?.length ? data.herramientas_usadas : undefined,
        sugerencias: data.sugerencias_seguimiento?.length
          ? data.sugerencias_seguimiento
          : undefined,
      }
      setMensajes((prev) => [...prev, asistenteMsg])
      scrollAlFinal()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setEnviando(false)
    }
  }, [enviando, mensajes])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void enviar(texto)
  }

  const chips =
    mensajes.length === 0
      ? [...EJEMPLOS]
      : (mensajes[mensajes.length - 1]?.sugerencias ?? [])

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/dashboard" className={styles.volver}>
          ← Dashboard
        </Link>
        <h1 className={styles.titulo}>Asistente financiero</h1>
        <p className={styles.subtitulo}>
          Preguntas en lenguaje natural sobre tus presupuestos, gastos y alertas del
          espacio activo. No crea ni modifica movimientos.
        </p>
        <p className={styles.nota}>
          Las alertas siguen en{' '}
          <Link to="/notificaciones" className={styles.link}>
            Notificaciones
          </Link>
          .
        </p>
      </header>

      <div className={styles.chat} ref={listaRef}>
        {mensajes.length === 0 ? (
          <p className={styles.vacio}>
            Escribe una pregunta o elige un ejemplo para empezar.
          </p>
        ) : (
          <ul className={styles.mensajes}>
            {mensajes.map((m) => (
              <li
                key={m.id}
                className={m.role === 'user' ? styles.msgUser : styles.msgAssistant}
              >
                <p className={styles.msgTexto}>{m.content}</p>
                {m.herramientas && m.herramientas.length > 0 ? (
                  <div className={styles.tools}>
                    {m.herramientas.map((t) => (
                      <span key={t} className={styles.toolChip}>
                        {t}
                      </span>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {enviando ? <p className={styles.pensando}>Consultando…</p> : null}
      </div>

      {error ? <p className={styles.msgErr} role="alert">{error}</p> : null}

      {chips.length > 0 && !enviando ? (
        <div className={styles.chips}>
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              className={styles.chip}
              onClick={() => void enviar(c)}
            >
              {c}
            </button>
          ))}
        </div>
      ) : null}

      <form className={styles.form} onSubmit={onSubmit}>
        <textarea
          className={styles.input}
          rows={2}
          placeholder="Ej.: ¿Cómo voy con el presupuesto familiar este mes?"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={enviando}
          maxLength={2000}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void enviar(texto)
            }
          }}
        />
        <Button type="submit" loading={enviando} disabled={!texto.trim() || enviando}>
          Enviar
        </Button>
      </form>
    </div>
  )
}
