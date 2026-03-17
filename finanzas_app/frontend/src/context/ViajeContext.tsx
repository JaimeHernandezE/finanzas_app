import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { MOCK_VIAJES, type Viaje } from '@/pages/viajes/mockViajes'

// -----------------------------------------------------------------------------
// Tipo del contexto
// -----------------------------------------------------------------------------

export interface ViajeContextType {
  viajes: Viaje[]
  setViajes: React.Dispatch<React.SetStateAction<Viaje[]>>
  viajeActivo: Viaje | null
  setViajeActivo: (viaje: Viaje | null) => void
  activarViaje: (id: string) => void
  desactivarViaje: (id: string) => void
}

const ViajeContext = createContext<ViajeContextType | null>(null)

// -----------------------------------------------------------------------------
// Provider
// -----------------------------------------------------------------------------

export function ViajeProvider({ children }: { children: ReactNode }) {
  const [viajes, setViajes] = useState<Viaje[]>(() => [...MOCK_VIAJES])

  const viajeActivo = useMemo(
    () => viajes.find((v) => v.esActivo) ?? null,
    [viajes]
  )

  const setViajeActivo = (viaje: Viaje | null) => {
    setViajes((prev) =>
      prev.map((v) => ({
        ...v,
        esActivo: viaje ? v.id === viaje.id : false,
      }))
    )
  }

  const activarViaje = (id: string) => {
    setViajes((prev) =>
      prev.map((v) => ({ ...v, esActivo: v.id === id }))
    )
  }

  const desactivarViaje = (id: string) => {
    setViajes((prev) =>
      prev.map((v) => (v.id === id ? { ...v, esActivo: false } : v))
    )
  }

  const value: ViajeContextType = useMemo(
    () => ({
      viajes,
      setViajes,
      viajeActivo,
      setViajeActivo,
      activarViaje,
      desactivarViaje,
    }),
    [viajes, viajeActivo]
  )

  return (
    <ViajeContext.Provider value={value}>{children}</ViajeContext.Provider>
  )
}

// -----------------------------------------------------------------------------
// Hook
// -----------------------------------------------------------------------------

export function useViaje(): ViajeContextType {
  const ctx = useContext(ViajeContext)
  if (!ctx) {
    throw new Error('useViaje debe usarse dentro de ViajeProvider')
  }
  return ctx
}
