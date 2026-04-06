// src/context/ConfigContext.tsx
// Configuración global de la app: zona horaria, moneda, formato.
// Las preferencias del usuario autenticado tienen precedencia sobre los valores globales.

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { useAuth } from './AuthContext'

interface MonedaConfig {
  codigo:              string
  simbolo:             string
  decimales:           number
  separador_miles:     string
  separador_decimales: string
}

interface ConfigGlobal {
  zona_horaria: string
  moneda:       MonedaConfig
}

interface ConfigContextType {
  config:           ConfigGlobal | null
  formatMonto:      (monto: number) => string
  formatFecha:      (iso: string) => string
  formatFechaHora:  (iso: string) => string
  zonaHoraria:      string
  locale:           string
}

const DEFAULT_CONFIG: ConfigGlobal = {
  zona_horaria: 'America/Santiago',
  moneda: {
    codigo:              'CLP',
    simbolo:             '$',
    decimales:           0,
    separador_miles:     '.',
    separador_decimales: ',',
  },
}

const ConfigContext = createContext<ConfigContextType>({
  config:          DEFAULT_CONFIG,
  formatMonto:     (m) => `$${m.toLocaleString('es-CL')}`,
  formatFecha:     (iso) => iso,
  formatFechaHora: (iso) => iso,
  zonaHoraria:     'America/Santiago',
  locale:          'es-CL',
})

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const { usuario } = useAuth()
  const [configGlobal, setConfigGlobal] = useState<ConfigGlobal>(DEFAULT_CONFIG)

  useEffect(() => {
    axios
      .get(`${import.meta.env.VITE_API_URL}/api/usuarios/config/`)
      .then(res => setConfigGlobal(res.data))
      .catch(() => {})
  }, [])

  // Preferencias efectivas: usuario tiene precedencia sobre el servidor
  const zonaHoraria = usuario?.zona_horaria ?? configGlobal.zona_horaria
  const monedaCodigo = usuario?.moneda_display ?? configGlobal.moneda.codigo

  // Locale BCP-47 derivado del idioma del usuario
  const locale = useMemo(() => {
    if (usuario?.idioma_ui === 'en') return 'en-US'
    return 'es-CL'
  }, [usuario?.idioma_ui])

  function formatMonto(monto: number): string {
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: monedaCodigo,
        minimumFractionDigits: monedaCodigo === 'CLP' ? 0 : 2,
        maximumFractionDigits: monedaCodigo === 'CLP' ? 0 : 2,
      }).format(monto)
    } catch {
      // Fallback si el código de moneda no es soportado por Intl
      return `${monedaCodigo} ${monto.toLocaleString(locale)}`
    }
  }

  function formatFecha(iso: string): string {
    try {
      // iso puede ser 'YYYY-MM-DD' (sin hora). Añadir T12:00:00 evita desfases de TZ.
      const dateStr = iso.length === 10 ? `${iso}T12:00:00` : iso
      return new Intl.DateTimeFormat(locale, {
        timeZone: zonaHoraria,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(new Date(dateStr))
    } catch {
      return iso
    }
  }

  function formatFechaHora(iso: string): string {
    try {
      return new Intl.DateTimeFormat(locale, {
        timeZone: zonaHoraria,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(iso))
    } catch {
      return iso
    }
  }

  return (
    <ConfigContext.Provider value={{
      config: configGlobal,
      formatMonto,
      formatFecha,
      formatFechaHora,
      zonaHoraria,
      locale,
    }}>
      {children}
    </ConfigContext.Provider>
  )
}

export function useConfig() {
  return useContext(ConfigContext)
}
