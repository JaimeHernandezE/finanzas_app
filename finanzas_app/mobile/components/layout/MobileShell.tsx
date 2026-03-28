import { type ReactNode, useMemo, useState } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native'
import { usePathname, useRouter } from 'expo-router'
import { useAuth } from '../../context/AuthContext'
import { useApi } from '@finanzas/shared/hooks/useApi'
import { finanzasApi, type CuentaPersonalApi } from '@finanzas/shared/api/finanzas'

type ItemNavegacion = {
  label: string
  icon: string
  route?: string
  activeOn?: string[]
}

const PERSONAL_FIJOS: ItemNavegacion[] = [
  { icon: '◈', label: 'Dashboard', route: '/(tabs)', activeOn: ['/', '/index'] },
]

const FAMILIA_FIJOS: ItemNavegacion[] = [
  { icon: '⊕', label: 'Gastos comunes', route: '/(tabs)/gastos', activeOn: ['/gastos'] },
  { icon: '₪', label: 'Sueldos', route: '/sueldos', activeOn: ['/sueldos'] },
]

const ANALISIS_ITEMS: ItemNavegacion[] = [
  { icon: '⇄', label: 'Resumen común', route: '/(tabs)/liquidacion', activeOn: ['/liquidacion'] },
  { icon: '▤', label: 'Presupuesto', route: '/presupuesto', activeOn: ['/presupuesto'] },
]

const MAS_ITEMS: ItemNavegacion[] = [
  { icon: '▭', label: 'Tarjetas', route: '/tarjetas', activeOn: ['/tarjetas'] },
  { icon: '△', label: 'Inversiones', activeOn: ['/inversiones'] },
  { icon: '◎', label: 'Viajes', activeOn: ['/viajes'] },
  { icon: '⚙', label: 'Configuración', route: '/perfil', activeOn: ['/perfil'] },
]

interface MobileShellProps {
  title: string
  children: ReactNode
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <Text className="px-5 pt-5 pb-2 text-[11px] tracking-widest text-muted font-semibold uppercase">
      {children}
    </Text>
  )
}

function cuentaPersonalPrimero(a: CuentaPersonalApi, b: CuentaPersonalApi) {
  const aEsPersonal = a.nombre.trim().toLowerCase() === 'personal'
  const bEsPersonal = b.nombre.trim().toLowerCase() === 'personal'
  if (aEsPersonal && !bEsPersonal) return -1
  if (!aEsPersonal && bEsPersonal) return 1
  return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
}

export function MobileShell({ title, children }: MobileShellProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const { data: cuentasRaw, loading: cuentasLoading } = useApi<CuentaPersonalApi[]>(
    async () => {
      if (!user) return { data: [] }
      return finanzasApi.getCuentasPersonales()
    },
    [user?.email ?? '']
  )

  const cuentas = (cuentasRaw ?? []) as CuentaPersonalApi[]
  const propias = useMemo(
    () => cuentas.filter((c) => c.es_propia).sort(cuentaPersonalPrimero),
    [cuentas]
  )
  const tuteladas = useMemo(
    () => cuentas.filter((c) => !c.es_propia).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [cuentas]
  )

  const inicial = useMemo(() => {
    if (!user?.nombre) return '?'
    return user.nombre.trim().charAt(0).toUpperCase() || '?'
  }, [user?.nombre])

  function isActiveStatic(item: ItemNavegacion): boolean {
    if (!item.activeOn || item.activeOn.length === 0) return false
    return item.activeOn.some((path) => pathname === path || pathname.startsWith(`${path}/`))
  }

  function isActiveCuenta(cuentaId: number): boolean {
    return pathname === `/cuenta/${cuentaId}` || pathname.startsWith(`/cuenta/${cuentaId}/`)
  }

  function navegar(route: string) {
    setSidebarOpen(false)
    router.push(route as never)
  }

  function filaCuenta(c: CuentaPersonalApi) {
    const route = `/cuenta/${c.id}`
    const active = isActiveCuenta(c.id)
    const subtitulo = !c.es_propia && c.duenio_nombre ? c.duenio_nombre : null
    return (
      <TouchableOpacity
        key={c.id}
        onPress={() => navegar(route)}
        className={`rounded-xl px-3 py-3 flex-row items-center ${active ? 'bg-accent' : 'bg-transparent'}`}
      >
        <Text className={`text-base mr-3 ${active ? 'text-dark' : 'text-white'}`}>◉</Text>
        <View className="flex-1 min-w-0">
          <Text
            className={`text-sm font-medium ${active ? 'text-dark' : 'text-white'}`}
            numberOfLines={1}
          >
            {c.nombre}
          </Text>
          {subtitulo && (
            <Text className={`text-xs mt-0.5 ${active ? 'text-dark/70' : 'text-white/50'}`} numberOfLines={1}>
              {subtitulo}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    )
  }

  function filaEstatica(item: ItemNavegacion) {
    const active = isActiveStatic(item)
    return (
      <TouchableOpacity
        key={item.label}
        disabled={!item.route}
        onPress={() => item.route && navegar(item.route)}
        className={`rounded-xl px-3 py-3 flex-row items-center ${active ? 'bg-accent' : 'bg-transparent'}`}
      >
        <Text className={`text-base mr-3 ${active ? 'text-dark' : 'text-white'}`}>{item.icon}</Text>
        <Text
          className={`text-sm font-medium ${
            active ? 'text-dark' : item.route ? 'text-white' : 'text-white/40'
          }`}
        >
          {item.label}
          {!item.route ? ' (próximamente)' : ''}
        </Text>
      </TouchableOpacity>
    )
  }

  return (
    <View className="flex-1 bg-surface">
      <View className="bg-white border-b border-border px-4 pt-12 pb-3">
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => setSidebarOpen(true)}
            className="w-10 h-10 rounded-lg border border-border items-center justify-center"
          >
            <Text className="text-dark text-lg">☰</Text>
          </TouchableOpacity>
          <Text className="flex-1 text-center text-dark font-bold text-base" numberOfLines={1}>
            {title}
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/perfil' as never)}
            className="w-10 h-10 rounded-full bg-dark items-center justify-center"
          >
            <Text className="text-accent font-bold text-sm">{inicial}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View className="flex-1">{children}</View>

      <Modal
        visible={sidebarOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSidebarOpen(false)}
      >
        <View className="flex-1 flex-row">
          <View className="w-[84%] max-w-[360px] bg-dark pt-12 pb-4">
            <TouchableOpacity
              onPress={() => {
                setSidebarOpen(false)
                router.push('/(tabs)' as never)
              }}
              className="px-5 pb-5 border-b border-white/10"
            >
              <Text className="text-white/70 text-xs uppercase tracking-widest mb-2">
                Finanzas Familiares
              </Text>
              <Text className="text-white text-2xl font-bold">Finanzas</Text>
            </TouchableOpacity>

            <View className="px-5 py-4 border-b border-white/10">
              <View className="flex-row items-center">
                <View className="w-9 h-9 rounded-full bg-accent items-center justify-center mr-3">
                  <Text className="text-dark font-bold">{inicial}</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-white font-semibold" numberOfLines={1}>
                    {user?.nombre ?? 'Usuario'}
                  </Text>
                  <Text className="text-white/60 text-xs" numberOfLines={1}>
                    {user?.email ?? 'Sin sesión'}
                  </Text>
                </View>
              </View>
            </View>

            <ScrollView className="flex-1">
              <GroupLabel>Personal</GroupLabel>
              <View className="px-3 gap-1">
                {PERSONAL_FIJOS.map((item) => filaEstatica(item))}
                {user && cuentasLoading && (
                  <View className="py-3 items-center">
                    <ActivityIndicator color="#c8f060" />
                  </View>
                )}
                {user && !cuentasLoading && propias.map((c) => filaCuenta(c))}
                {user && !cuentasLoading && propias.length === 0 && (
                  <Text className="px-3 py-2 text-white/50 text-xs">
                    Sin cuentas personales. Créalas desde la versión web (Configuración → Cuentas).
                  </Text>
                )}
              </View>

              <GroupLabel>Familia</GroupLabel>
              <View className="px-3 gap-1">
                {user && !cuentasLoading && tuteladas.map((c) => filaCuenta(c))}
                {FAMILIA_FIJOS.map((item) => filaEstatica(item))}
              </View>

              <GroupLabel>Análisis</GroupLabel>
              <View className="px-3 gap-1">{ANALISIS_ITEMS.map((item) => filaEstatica(item))}</View>

              <GroupLabel>Más</GroupLabel>
              <View className="px-3 gap-1">{MAS_ITEMS.map((item) => filaEstatica(item))}</View>
            </ScrollView>

            <View className="px-4 pt-4 border-t border-white/10">
              <TouchableOpacity
                onPress={() => {
                  setSidebarOpen(false)
                  void logout()
                }}
                className="border border-white/20 rounded-xl py-3 items-center"
              >
                <Text className="text-white font-semibold">Cerrar sesión</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Pressable className="flex-1 bg-black/35" onPress={() => setSidebarOpen(false)} />
        </View>
      </Modal>
    </View>
  )
}
