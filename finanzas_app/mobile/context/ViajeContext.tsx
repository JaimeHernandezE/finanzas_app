import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { viajesApi } from '@finanzas/shared/api/viajes'
import type { ViajeLista } from '@finanzas/shared/types'
import { useAuth } from './AuthContext'

export interface ViajeContextType {
  viajes: ViajeLista[]
  setViajes: React.Dispatch<React.SetStateAction<ViajeLista[]>>
  viajeActivo: ViajeLista | null
  setViajeActivo: (viaje: ViajeLista | null) => void
  activarViaje: (id: string) => void
  desactivarViaje: (id: string) => void
  refetchViajes: () => void
}

const ViajeContext = createContext<ViajeContextType | null>(null)

function mapApiToViaje(v: {
  id: number
  nombre: string
  fecha_inicio: string
  fecha_fin: string
  color_tema: string
  es_activo: boolean
  archivado: boolean
}): ViajeLista {
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

export function ViajeProvider({ children }: { children: ReactNode }) {
  const { usuario, loading: authLoading } = useAuth()
  const [viajes, setViajes] = useState<ViajeLista[]>([])

  const cargarViajes = useCallback(async () => {
    if (!usuario) {
      setViajes([])
      return
    }
    try {
      const res = await viajesApi.getViajes(false)
      const list = (res.data ?? []) as {
        id: number
        nombre: string
        fecha_inicio: string
        fecha_fin: string
        color_tema: string
        es_activo: boolean
        archivado: boolean
      }[]
      setViajes(list.map(mapApiToViaje))
    } catch {
      setViajes([])
    }
  }, [usuario])

  useEffect(() => {
    if (authLoading) return
    if (!usuario) {
      setViajes([])
      return
    }
    cargarViajes()
  }, [authLoading, usuario, cargarViajes])

  const viajeActivo = useMemo(
    () => viajes.find((v) => v.esActivo) ?? null,
    [viajes]
  )

  const setViajeActivo = (viaje: ViajeLista | null) => {
    setViajes((prev) =>
      prev.map((v) => ({
        ...v,
        esActivo: viaje ? v.id === viaje.id : false,
      }))
    )
  }

  const activarViaje = (id: string) => {
    setViajes((prev) => prev.map((v) => ({ ...v, esActivo: v.id === id })))
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

export function useViaje(): ViajeContextType {
  const ctx = useContext(ViajeContext)
  if (!ctx) {
    throw new Error('useViaje debe usarse dentro de ViajeProvider')
  }
  return ctx
}
