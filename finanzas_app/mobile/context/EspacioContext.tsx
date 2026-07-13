import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { setEspacioId } from '../../shared/api/client'
import { useAuth } from './AuthContext'
import type { Espacio } from '@finanzas/shared/types'

interface EspacioContextType {
  espacios: Espacio[]
  familiaresActivos: Espacio[]
  necesitaSelectorFamilia: boolean
  espacioActivo: Espacio | null
  setEspacioActivoId: (id: number) => void
  esPersonal: boolean
  esFamiliar: boolean
  mostrarModulosFamiliares: boolean
  ocultarModulosFamiliares: boolean
  setOcultarModulosFamiliares: (v: boolean) => void
}

const EspacioContext = createContext<EspacioContextType | null>(null)

const STORAGE_KEY = 'espacio_familiar_activo_id'
const STORAGE_KEY_LEGACY = 'espacio_activo_id'
const OCULTAR_FAMILIAR_KEY = 'ocultar_modulos_familiares'

function familiaresNoArchivados(espacios: Espacio[]): Espacio[] {
  return espacios.filter(e => e.tipo === 'FAMILIAR' && !e.archivado)
}

function resolverEspacioActivo(
  espacios: Espacio[],
  familiarPreferidoId: number | null,
): Espacio | null {
  if (espacios.length === 0) return null

  const familiares = familiaresNoArchivados(espacios)
  const personal = espacios.find(e => e.tipo === 'PERSONAL')

  if (familiares.length === 0) {
    return personal ?? espacios[0]
  }
  if (familiares.length === 1) {
    return familiares[0]
  }
  if (familiarPreferidoId != null) {
    const elegido = familiares.find(e => e.id === familiarPreferidoId)
    if (elegido) return elegido
  }
  return familiares[0]
}

export function EspacioProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const espacios = useMemo(() => (user as { espacios?: Espacio[] } | null)?.espacios ?? [], [user])
  const familiaresActivos = useMemo(() => familiaresNoArchivados(espacios), [espacios])
  const necesitaSelectorFamilia = familiaresActivos.length > 1

  const [familiarPreferidoId, setFamiliarPreferidoId] = useState<number | null>(null)
  const [storageLoaded, setStorageLoaded] = useState(false)
  const [ocultarModulosFamiliares, setOcultarModulosFamiliaresState] = useState(false)

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(STORAGE_KEY_LEGACY),
      AsyncStorage.getItem(OCULTAR_FAMILIAR_KEY),
    ])
      .then(([nuevoVal, legacyVal, ocultarVal]) => {
        const raw = nuevoVal ?? legacyVal
        if (raw) {
          const id = Number(raw)
          if (Number.isFinite(id)) setFamiliarPreferidoId(id)
        }
        if (ocultarVal === '1') setOcultarModulosFamiliaresState(true)
      })
      .catch(() => {})
      .finally(() => setStorageLoaded(true))
  }, [])

  const espacioActivo = useMemo(
    () => resolverEspacioActivo(espacios, familiarPreferidoId),
    [espacios, familiarPreferidoId],
  )

  useEffect(() => {
    if (!storageLoaded) return
    const id = espacioActivo?.id ?? null
    setEspacioId(id)
    if (
      necesitaSelectorFamilia &&
      espacioActivo?.tipo === 'FAMILIAR' &&
      espacioActivo.id !== familiarPreferidoId
    ) {
      setFamiliarPreferidoId(espacioActivo.id)
      AsyncStorage.setItem(STORAGE_KEY, String(espacioActivo.id)).catch(() => {})
    }
  }, [
    storageLoaded,
    espacioActivo?.id,
    espacioActivo?.tipo,
    familiarPreferidoId,
    necesitaSelectorFamilia,
  ])

  function setEspacioActivoId(id: number) {
    const espacio = espacios.find(e => e.id === id)
    if (espacio?.tipo === 'FAMILIAR') {
      setFamiliarPreferidoId(id)
      AsyncStorage.setItem(STORAGE_KEY, String(id)).catch(() => {})
      return
    }
    setFamiliarPreferidoId(null)
    AsyncStorage.multiRemove([STORAGE_KEY, STORAGE_KEY_LEGACY]).catch(() => {})
  }

  function setOcultarModulosFamiliares(v: boolean) {
    setOcultarModulosFamiliaresState(v)
    AsyncStorage.setItem(OCULTAR_FAMILIAR_KEY, v ? '1' : '0').catch(() => {})
  }

  const esPersonal = espacioActivo?.tipo === 'PERSONAL'
  const esFamiliar = espacioActivo?.tipo === 'FAMILIAR'
  const mostrarModulosFamiliares = familiaresActivos.length > 0 && !ocultarModulosFamiliares

  const value: EspacioContextType = {
    espacios,
    familiaresActivos,
    necesitaSelectorFamilia,
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
