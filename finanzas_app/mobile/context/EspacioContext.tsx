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
  mostrarModulosFamiliares: boolean
  ocultarModulosFamiliares: boolean
  setOcultarModulosFamiliares: (v: boolean) => void
}

const EspacioContext = createContext<EspacioContextType | null>(null)

const STORAGE_KEY = 'espacio_activo_id'
const OCULTAR_FAMILIAR_KEY = 'ocultar_modulos_familiares'

function espacioPorDefecto(espacios: Espacio[]): Espacio | null {
  if (espacios.length === 0) return null
  return (
    espacios.find(e => e.tipo === 'PERSONAL') ??
    espacios.find(e => e.tipo === 'FAMILIAR' && !e.archivado) ??
    espacios[0]
  )
}

export function EspacioProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const espacios = useMemo(() => (user as { espacios?: Espacio[] } | null)?.espacios ?? [], [user])

  const [activoId, setActivoId] = useState<number | null>(null)
  const [storageLoaded, setStorageLoaded] = useState(false)
  const [ocultarModulosFamiliares, setOcultarModulosFamiliaresState] = useState(false)

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(OCULTAR_FAMILIAR_KEY),
    ])
      .then(([espacioVal, ocultarVal]) => {
        if (espacioVal) setActivoId(Number(espacioVal))
        if (ocultarVal === '1') setOcultarModulosFamiliaresState(true)
      })
      .catch(() => {})
      .finally(() => setStorageLoaded(true))
  }, [])

  const espacioActivo = useMemo(() => {
    if (espacios.length === 0) return null
    const found = activoId != null ? espacios.find((e: Espacio) => e.id === activoId) : null
    if (found) return found
    return espacioPorDefecto(espacios)
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

  function setOcultarModulosFamiliares(v: boolean) {
    setOcultarModulosFamiliaresState(v)
    AsyncStorage.setItem(OCULTAR_FAMILIAR_KEY, v ? '1' : '0').catch(() => {})
  }

  const esPersonal = espacioActivo?.tipo === 'PERSONAL'
  const esFamiliar = espacioActivo?.tipo === 'FAMILIAR'
  const mostrarModulosFamiliares = esFamiliar && !ocultarModulosFamiliares

  const value: EspacioContextType = {
    espacios,
    espacioActivo,
    setEspacioActivoId,
    esPersonal,
    esFamiliar,
    mostrarModulosFamiliares,
    ocultarModulosFamiliares,
    setOcultarModulosFamiliares,
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
