import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { setEspacioId } from '@/api/client'
import { useAuth, type EspacioMe } from './AuthContext'

interface EspacioContextType {
  espacios: EspacioMe[]
  espacioActivo: EspacioMe | null
  setEspacioActivoId: (id: number) => void
  esPersonal: boolean
  esFamiliar: boolean
}

const EspacioContext = createContext<EspacioContextType | null>(null)

const STORAGE_KEY = 'espacio_activo_id'

export function EspacioProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const espacios = useMemo(() => user?.espacios ?? [], [user?.espacios])

  const [activoId, setActivoId] = useState<number | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? Number(stored) : null
  })

  const espacioActivo = useMemo(() => {
    if (espacios.length === 0) return null
    const found = activoId != null ? espacios.find(e => e.id === activoId) : null
    if (found) return found
    return espacios.find(e => e.tipo === 'FAMILIAR' && !e.archivado) ?? espacios[0]
  }, [espacios, activoId])

  useEffect(() => {
    const id = espacioActivo?.id ?? null
    setEspacioId(id)
    if (id != null) {
      localStorage.setItem(STORAGE_KEY, String(id))
    }
  }, [espacioActivo?.id])

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
  if (!ctx) throw new Error('useEspacio must be used within EspacioProvider')
  return ctx
}
