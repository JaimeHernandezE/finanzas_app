import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useCategorias } from '@finanzas/shared/hooks/useCatalogos'
import { catalogosApi } from '@finanzas/shared/api/catalogos'
import { apiErrorMessage } from '@finanzas/shared/api'
import { finanzasApi, type CuentaPersonalApi } from '@finanzas/shared/api/finanzas'
import { MobileShell } from '../../components/layout/MobileShell'
import { CategoriaFormModal } from '../../components/categorias/CategoriaFormModal'
import {
  buildJerarquiaCategorias,
  mapApiToCategoria,
  type CategoriaUIModel,
} from '../../components/categorias/categoriaUtils'
import { queryClient } from '../../lib/queryClient'
import { useAuth } from '../../context/AuthContext'

function cuentaPersonalPrimero(a: CuentaPersonalApi, b: CuentaPersonalApi) {
  const aEsPersonal = a.nombre.trim().toLowerCase() === 'personal'
  const bEsPersonal = b.nombre.trim().toLowerCase() === 'personal'
  if (aEsPersonal && !bEsPersonal) return -1
  if (!aEsPersonal && bEsPersonal) return 1
  return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
}

export default function CategoriasScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const soloLectura = user?.rol === 'LECTURA'

  const { data: categoriasRaw, loading, error } = useCategorias()
  const qCuentas = useQuery<CuentaPersonalApi[]>({
    queryKey: ['cuentasPersonales'],
    queryFn: () =>
      finanzasApi
        .getCuentasPersonales()
        .then((r: { data: CuentaPersonalApi[] }) => r.data),
    enabled: !!user,
  })

  const categorias = useMemo(() => {
    const raw = (categoriasRaw ?? []) as {
      id: number
      nombre: string
      tipo: string
      es_inversion?: boolean
      familia?: number | null
      usuario?: number | null
      cuenta_personal?: number | null
      categoria_padre?: number | null
      es_padre?: boolean
    }[]
    return raw.map(mapApiToCategoria).filter((c) => c.ambito !== 'GLOBAL')
  }, [categoriasRaw])

  const cuentasPropias = useMemo(
    () => (qCuentas.data ?? []).filter((c) => c.es_propia).sort(cuentaPersonalPrimero),
    [qCuentas.data],
  )

  const familiaresAll = useMemo(
    () => categorias.filter((c) => c.ambito === 'FAMILIAR'),
    [categorias],
  )
  const personalesAll = useMemo(
    () => categorias.filter((c) => c.ambito === 'PERSONAL'),
    [categorias],
  )

  const [filtroTipo, setFiltroTipo] = useState<'INGRESO' | 'EGRESO'>('EGRESO')

  const filtradas = useMemo(
    () => categorias.filter((c) => c.tipo === filtroTipo),
    [categorias, filtroTipo],
  )
  const familiares = useMemo(
    () => filtradas.filter((c) => c.ambito === 'FAMILIAR'),
    [filtradas],
  )
  const personales = useMemo(
    () => filtradas.filter((c) => c.ambito === 'PERSONAL'),
    [filtradas],
  )

  const cuentaPersonalPrincipalId = useMemo(
    () =>
      cuentasPropias.find((c) => c.nombre.trim().toLowerCase() === 'personal')?.id ?? null,
    [cuentasPropias],
  )

  const cuentasPorId = useMemo(
    () => new Map(cuentasPropias.map((c) => [c.id, c.nombre])),
    [cuentasPropias],
  )

  /** Misma lógica que CategoriasPage (web): principal → otras cuentas → sin cuenta */
  const personalesCuentaPrincipal = useMemo(() => {
    if (cuentaPersonalPrincipalId == null) return []
    return personales.filter((c) => c.cuentaPersonal === cuentaPersonalPrincipalId)
  }, [personales, cuentaPersonalPrincipalId])

  const personalesSinCuenta = useMemo(
    () => personales.filter((c) => c.cuentaPersonal == null),
    [personales],
  )

  const personalesOtrasCuentas = useMemo(() => {
    const porCuenta = new Map<number, CategoriaUIModel[]>()
    for (const c of personales) {
      if (c.cuentaPersonal == null) continue
      if (
        cuentaPersonalPrincipalId != null &&
        c.cuentaPersonal === cuentaPersonalPrincipalId
      )
        continue
      porCuenta.set(c.cuentaPersonal, [...(porCuenta.get(c.cuentaPersonal) ?? []), c])
    }
    const agrupadas: {
      cuentaId: number
      nombreCuenta: string
      categorias: CategoriaUIModel[]
    }[] = []
    for (const [cuentaId, cats] of porCuenta.entries()) {
      agrupadas.push({
        cuentaId,
        nombreCuenta: cuentasPorId.get(cuentaId) ?? `Cuenta ${cuentaId}`,
        categorias: cats,
      })
    }
    agrupadas.sort((a, b) =>
      a.nombreCuenta.localeCompare(b.nombreCuenta, 'es', { sensitivity: 'base' }),
    )
    return agrupadas
  }, [personales, cuentaPersonalPrincipalId, cuentasPorId])

  const jerFam = useMemo(() => buildJerarquiaCategorias(familiares), [familiares])
  const jerPrincipal = useMemo(
    () => buildJerarquiaCategorias(personalesCuentaPrincipal),
    [personalesCuentaPrincipal],
  )
  const jerSinCuenta = useMemo(
    () => buildJerarquiaCategorias(personalesSinCuenta),
    [personalesSinCuenta],
  )

  const [formOpen, setFormOpen] = useState(false)
  const [formModo, setFormModo] = useState<'crear' | 'editar'>('crear')
  const [formAmbito, setFormAmbito] = useState<'FAMILIAR' | 'PERSONAL'>('FAMILIAR')
  const [formCategoria, setFormCategoria] = useState<CategoriaUIModel | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<CategoriaUIModel | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function abrirCrear(ambito: 'FAMILIAR' | 'PERSONAL') {
    setFormModo('crear')
    setFormAmbito(ambito)
    setFormCategoria(null)
    setFormOpen(true)
  }

  function abrirEditar(c: CategoriaUIModel) {
    setFormModo('editar')
    setFormAmbito(c.ambito === 'PERSONAL' ? 'PERSONAL' : 'FAMILIAR')
    setFormCategoria(c)
    setFormOpen(true)
  }

  async function confirmarEliminar() {
    if (!deleteTarget) return
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      await catalogosApi.deleteCategoria(Number(deleteTarget.id))
      await queryClient.invalidateQueries({ queryKey: ['categorias'] })
      setDeleteTarget(null)
    } catch (e: unknown) {
      setDeleteError(apiErrorMessage(e))
    } finally {
      setDeleteLoading(false)
    }
  }

  function SegmentedTipo() {
    return (
      <View className="flex-row rounded-xl border border-border overflow-hidden mb-4">
        <TouchableOpacity
          onPress={() => setFiltroTipo('EGRESO')}
          className={`flex-1 py-3 items-center ${filtroTipo === 'EGRESO' ? 'bg-dark' : 'bg-white'}`}
        >
          <Text
            className={`font-semibold text-sm ${filtroTipo === 'EGRESO' ? 'text-white' : 'text-dark'}`}
          >
            Egreso
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setFiltroTipo('INGRESO')}
          className={`flex-1 py-3 items-center ${filtroTipo === 'INGRESO' ? 'bg-dark' : 'bg-white'}`}
        >
          <Text
            className={`font-semibold text-sm ${filtroTipo === 'INGRESO' ? 'text-white' : 'text-dark'}`}
          >
            Ingreso
          </Text>
        </TouchableOpacity>
      </View>
    )
  }

  function renderFila({ c, esHija }: { c: CategoriaUIModel; esHija: boolean }) {
    return (
      <View
        key={c.id}
        className="flex-row items-center justify-between py-3 border-b border-border"
        style={esHija ? { paddingLeft: 24 } : undefined}
      >
        <View className="flex-1 mr-2">
          <Text className="text-dark font-medium">
            {esHija ? '↳ ' : ''}
            {c.nombre}
          </Text>
          <View className="flex-row flex-wrap gap-2 mt-1">
            {c.esInversion ? (
              <Text className="text-xs text-accent font-semibold bg-dark/10 px-2 py-0.5 rounded">
                inversión
              </Text>
            ) : null}
            <Text className="text-xs text-muted">
              {c.tipo === 'EGRESO' ? 'Egreso' : 'Ingreso'}
            </Text>
          </View>
        </View>
        {!soloLectura ? (
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={() => abrirEditar(c)}
              className="px-3 py-2 rounded-lg border border-border bg-white"
            >
              <Text className="text-dark text-xs font-semibold">Editar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setDeleteError(null)
                setDeleteTarget(c)
              }}
              className="px-3 py-2 rounded-lg border border-danger bg-white"
            >
              <Text className="text-danger text-xs font-semibold">Eliminar</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    )
  }

  function bloqueTitulo(titulo: string) {
    return (
      <Text className="text-[11px] tracking-widest text-muted font-semibold uppercase mt-6 mb-2">
        {titulo}
      </Text>
    )
  }

  function subTituloCuenta(titulo: string) {
    return <Text className="text-xs font-semibold text-dark mb-2 mt-4">{titulo}</Text>
  }

  const nombreCuentaPrincipal =
    cuentaPersonalPrincipalId != null
      ? cuentasPorId.get(cuentaPersonalPrincipalId) ?? 'Principal'
      : null

  if (!user) {
    return (
      <MobileShell title="Categorías">
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-muted text-sm">Inicia sesión para gestionar categorías.</Text>
        </View>
      </MobileShell>
    )
  }

  return (
    <MobileShell title="Categorías">
      <ScrollView
        className="flex-1 bg-surface"
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          className="self-start rounded-lg border border-border px-3 py-2 mb-4"
        >
          <Text className="text-dark text-xs font-semibold">← Volver</Text>
        </TouchableOpacity>

        {soloLectura ? (
          <Text className="text-muted text-sm mb-4">
            Tu rol es solo lectura: no puedes crear ni editar categorías.
          </Text>
        ) : null}

        <Text className="text-xs text-muted uppercase font-semibold tracking-wide mb-2">
          Tipo mostrado
        </Text>
        <SegmentedTipo />

        {loading ? (
          <ActivityIndicator className="mt-8" />
        ) : error ? (
          <Text className="text-danger text-sm">{error}</Text>
        ) : (
          <>
            {bloqueTitulo('De la familia')}
            <View className="bg-white border border-border rounded-xl px-3">
              {jerFam.length === 0 ? (
                <Text className="text-muted text-sm py-4">No hay categorías familiares en este tipo.</Text>
              ) : (
                jerFam.map((row) => renderFila(row))
              )}
              {!soloLectura ? (
                <TouchableOpacity
                  onPress={() => abrirCrear('FAMILIAR')}
                  className="py-4 border-t border-border"
                >
                  <Text className="text-accent font-semibold text-center">+ Agregar</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {bloqueTitulo('Personales')}
            {personales.length === 0 ? (
              <View className="bg-white border border-border rounded-xl px-3">
                <Text className="text-muted text-sm py-4">
                  No hay categorías personales en este tipo.
                </Text>
                {!soloLectura ? (
                  <TouchableOpacity
                    onPress={() => abrirCrear('PERSONAL')}
                    className="py-4 border-t border-border"
                  >
                    <Text className="text-accent font-semibold text-center">+ Agregar</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : (
              <>
                {cuentaPersonalPrincipalId != null ? (
                  <View className="mb-2">
                    {subTituloCuenta(nombreCuentaPrincipal ?? 'Cuenta principal')}
                    <View className="bg-white border border-border rounded-xl px-3">
                      {jerPrincipal.length === 0 ? (
                        <Text className="text-muted text-sm py-4">Sin categorías en esta cuenta.</Text>
                      ) : (
                        jerPrincipal.map((row) => renderFila(row))
                      )}
                    </View>
                  </View>
                ) : null}

                {personalesOtrasCuentas.map((g) => {
                  const jerGrupo = buildJerarquiaCategorias(g.categorias)
                  return (
                    <View key={g.cuentaId} className="mb-2">
                      {subTituloCuenta(g.nombreCuenta)}
                      <View className="bg-white border border-border rounded-xl px-3">
                        {jerGrupo.length === 0 ? (
                          <Text className="text-muted text-sm py-4">Sin categorías.</Text>
                        ) : (
                          jerGrupo.map((row) => renderFila(row))
                        )}
                      </View>
                    </View>
                  )
                })}

                <View>
                  {subTituloCuenta('Sin cuenta')}
                  <View className="bg-white border border-border rounded-xl px-3">
                    {jerSinCuenta.length === 0 ? (
                      <Text className="text-muted text-sm py-4">
                        Sin categorías sin cuenta asignada.
                      </Text>
                    ) : (
                      jerSinCuenta.map((row) => renderFila(row))
                    )}
                    {!soloLectura ? (
                      <TouchableOpacity
                        onPress={() => abrirCrear('PERSONAL')}
                        className="py-4 border-t border-border"
                      >
                        <Text className="text-accent font-semibold text-center">+ Agregar</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>

      <CategoriaFormModal
        visible={formOpen}
        onClose={() => setFormOpen(false)}
        modo={formModo}
        ambito={formAmbito}
        tipoInicial={filtroTipo}
        categoria={formCategoria}
        todasCategorias={formAmbito === 'FAMILIAR' ? familiaresAll : personalesAll}
        cuentasPropias={cuentasPropias}
      />

      <Modal visible={deleteTarget != null} transparent animationType="fade">
        <View className="flex-1 bg-black/50 items-center justify-center px-6">
          <View className="bg-white rounded-2xl p-6 w-full max-w-sm border border-border">
            <Text className="text-dark font-bold text-lg mb-2">Eliminar categoría</Text>
            <Text className="text-dark text-sm mb-4">
              ¿Eliminar «{deleteTarget?.nombre ?? ''}»?
            </Text>
            {deleteError ? <Text className="text-danger text-sm mb-4">{deleteError}</Text> : null}
            <View className="flex-row gap-3 justify-end">
              <TouchableOpacity
                onPress={() => {
                  setDeleteTarget(null)
                  setDeleteError(null)
                }}
                disabled={deleteLoading}
                className="px-4 py-3 rounded-xl border border-border"
              >
                <Text className="text-dark font-semibold">No</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void confirmarEliminar()}
                disabled={deleteLoading}
                className="px-4 py-3 rounded-xl bg-danger"
              >
                {deleteLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-semibold">Sí, eliminar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </MobileShell>
  )
}
