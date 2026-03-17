import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { viajesApi } from '@/api'
import type { Viaje } from '@/pages/viajes/mockViajes'

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
  refetchViajes: () => void
}

const ViajeContext = createContext<ViajeContextType | null>(null)

function mapApiToViaje(v: { id: number; nombre: string; fecha_inicio: string; fecha_fin: string; color_tema: string; es_activo: boolean; archivado: boolean }): Viaje {
  return {
    id: String(v.id),
    nombre: v.nombre,
    fechaInicio: v.fecha_inicio,
    fechaFin: v.fecha_fin,
    colorTema: v.color_tema || '#2E86AB',
    esActivo: v.es_activo,
    archivado: v.archivado,
  }
}

// -----------------------------------------------------------------------------
// Provider
// -----------------------------------------------------------------------------

export function ViajeProvider({ children }: { children: ReactNode }) {
  const [viajes, setViajes] = useState<Viaje[]>([])

  const cargarViajes = useCallback(async () => {
    try {
      const res = await viajesApi.getViajes(false)
      const list = (res.data ?? []) as { id: number; nombre: string; fecha_inicio: string; fecha_fin: string; color_tema: string; es_activo: boolean; archivado: boolean }[]
      setViajes(list.map(mapApiToViaje))
    } catch {
      setViajes([])
    }
  }, [])

  useEffect(() => {
    cargarViajes()
  }, [cargarViajes])

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
      refetchViajes: cargarViajes,
    }),
    [viajes, viajeActivo, cargarViajes]
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
