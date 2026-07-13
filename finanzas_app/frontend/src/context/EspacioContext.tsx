import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { setEspacioId } from '@/api/client'
import { useAuth, type EspacioMe } from './AuthContext'

interface EspacioContextType {
  espacios: EspacioMe[]
  familiaresActivos: EspacioMe[]
  /** True si el usuario pertenece a 2+ familias activas (selector en Configuración). */
  necesitaSelectorFamilia: boolean
  espacioActivo: EspacioMe | null
  setEspacioActivoId: (id: number) => void
  esPersonal: boolean
  esFamiliar: boolean
  mostrarModulosFamiliares: boolean
  ocultarModulosFamiliares: boolean
  setOcultarModulosFamiliares: (v: boolean) => void
}

const EspacioContext = createContext<EspacioContextType | null>(null)

const STORAGE_KEY = 'espacio_familiar_activo_id'
const OCULTAR_FAMILIAR_KEY = 'ocultar_modulos_familiares'

function familiaresNoArchivados(espacios: EspacioMe[]): EspacioMe[] {
  return espacios.filter(e => e.tipo === 'FAMILIAR' && !e.archivado)
}

function resolverEspacioActivo(
  espacios: EspacioMe[],
  familiarPreferidoId: number | null,
): EspacioMe | null {
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
  const espacios = useMemo(() => user?.espacios ?? [], [user?.espacios])
  const familiaresActivos = useMemo(() => familiaresNoArchivados(espacios), [espacios])
  const necesitaSelectorFamilia = familiaresActivos.length > 1

  const [familiarPreferidoId, setFamiliarPreferidoId] = useState<number | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? Number(stored) : null
  })

  const [ocultarModulosFamiliares, setOcultarModulosFamiliaresState] = useState(() => {
    return localStorage.getItem(OCULTAR_FAMILIAR_KEY) === '1'
  })

  const espacioActivo = useMemo(
    () => resolverEspacioActivo(espacios, familiarPreferidoId),
    [espacios, familiarPreferidoId],
  )

  useEffect(() => {
    const id = espacioActivo?.id ?? null
    setEspacioId(id)
  }, [espacioActivo?.id])

  useEffect(() => {
    if (!necesitaSelectorFamilia) return
    if (espacioActivo?.tipo === 'FAMILIAR' && espacioActivo.id !== familiarPreferidoId) {
      setFamiliarPreferidoId(espacioActivo.id)
      localStorage.setItem(STORAGE_KEY, String(espacioActivo.id))
    }
  }, [necesitaSelectorFamilia, espacioActivo?.id, espacioActivo?.tipo, familiarPreferidoId])

  function setEspacioActivoId(id: number) {
    const espacio = espacios.find(e => e.id === id)
    if (espacio?.tipo === 'FAMILIAR') {
      setFamiliarPreferidoId(id)
      localStorage.setItem(STORAGE_KEY, String(id))
      return
    }
    setFamiliarPreferidoId(null)
    localStorage.removeItem(STORAGE_KEY)
  }

  function setOcultarModulosFamiliares(v: boolean) {
    setOcultarModulosFamiliaresState(v)
    localStorage.setItem(OCULTAR_FAMILIAR_KEY, v ? '1' : '0')
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
  if (!ctx) throw new Error('useEspacio must be used within EspacioProvider')
  return ctx
}
