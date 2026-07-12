import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { setEspacioId } from '../../shared/api/client'
import { useAuth } from './AuthContext'
import type { Espacio } from '@finanzas/shared/types'
import AsyncStorage from '@react-native-async-storage/async-storage'

interface EspacioContextType {
  espacios: Espacio[]
  espacioActivo: Espacio | null
  setEspacioActivoId: (id: number) => void
  esPersonal: boolean
  esFamiliar: boolean
}

const EspacioContext = createContext<EspacioContextType | null>(null)

const STORAGE_KEY = 'espacio_activo_id'

export function EspacioProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const espacios = useMemo(() => (user as any)?.espacios ?? [], [user])

  const [activoId, setActivoId] = useState<number | null>(null)
  const [storageLoaded, setStorageLoaded] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((val) => {
        if (val) setActivoId(Number(val))
      })
      .catch(() => {})
      .finally(() => setStorageLoaded(true))
  }, [])

  const espacioActivo = useMemo(() => {
    if (espacios.length === 0) return null
    const found = activoId != null ? espacios.find((e: Espacio) => e.id === activoId) : null
    if (found) return found
    return espacios.find((e: Espacio) => e.tipo === 'FAMILIAR' && !e.archivado) ?? espacios[0]
  }, [espacios, activoId])

  useEffect(() => {
    const id = espacioActivo?.id ?? null
    setEspacioId(id)
    if (id != null && storageLoaded) {
      AsyncStorage.setItem(STORAGE_KEY, String(id)).catch(() => {})
    }
  }, [espacioActivo?.id, storageLoaded])

  function setEspacioActivoId(id: number) {
    setActivoId(id)
  }

  const value: EspacioContextType = {
    espacios,
    espacioActivo,
    setEspacioActivoId,
    esPersonal: espacioActivo?.tipo === 'PERSONAL',
    esFamiliar: espacioActivo?.tipo === 'FAMILIAR',
  }

  return (
    <EspacioContext.Provider value={value}>
      {children}
    </EspacioContext.Provider>
  )
}

export function useEspacio() {
  const ctx = useContext(EspacioContext)
  if (!ctx) throw new Error('useEspacio debe usarse dentro de EspacioProvider')
  return ctx
}
