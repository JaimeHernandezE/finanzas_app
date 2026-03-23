// src/context/ConfigContext.tsx
// Configuración global de la app: zona horaria, moneda, formato.
// Se carga una vez al montar la app y está disponible en todos los componentes.

import { createContext, useContext, useEffect, useState } from 'react'
import axios from 'axios'

interface MonedaConfig {
  codigo:              string   // 'CLP'
  simbolo:             string   // '$'
  decimales:           number   // 0
  separador_miles:     string   // '.'
  separador_decimales: string   // ','
}

interface Config {
  zona_horaria: string
  moneda:       MonedaConfig
}

interface ConfigContextType {
  config:      Config | null
  formatMonto: (monto: number) => string
}

const DEFAULT_CONFIG: Config = {
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
  config:      DEFAULT_CONFIG,
  formatMonto: (m) => `$${m.toLocaleString('es-CL')}`,
})

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG)

  useEffect(() => {
    const cargar = async () => {
      try {
        const baseURL =
          (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) ??
          (typeof import.meta !== 'undefined'
            ? (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL
            : undefined) ??
          'http://localhost:8000'
        const res = await axios.get(`${baseURL}/api/usuarios/config/`)
        setConfig(res.data)
      } catch {
        // Usar configuración por defecto si falla
      }
    }
    cargar()
  }, [])

  /**
   * Formatea un monto según la configuración de moneda activa.
   * Ej: 1500000 → "$1.500.000" en CLP
   *
   * En el futuro, si se agrega tipo de cambio, esta función
   * puede convertir entre monedas antes de formatear.
   */
  function formatMonto(monto: number): string {
    const { simbolo, decimales } = config.moneda

    const formatted = new Intl.NumberFormat('es-CL', {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
    }).format(monto)

    return `${simbolo}${formatted}`
  }

  return (
    <ConfigContext.Provider value={{ config, formatMonto }}>
      {children}
    </ConfigContext.Provider>
  )
}

export function useConfig() {
  return useContext(ConfigContext)
}
