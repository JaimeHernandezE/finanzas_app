import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { apiErrorMessage, espaciosApi, exportApi, familiaApi } from '@finanzas/shared/api'
import type { ModoReparto } from '@finanzas/shared/api/espacios'
import { driveApi } from '@finanzas/shared/api/drive'
import { useAuth } from '../../context/AuthContext'
import { useEspacio } from '../../context/EspacioContext'
import { MobileShell } from '../../components/layout/MobileShell'

const MODOS_REPARTO: { value: ModoReparto; label: string }[] = [
  { value: 'PROPORCIONAL', label: 'Proporcional a los ingresos' },
  { value: 'PARTES_IGUALES', label: 'Partes iguales' },
  { value: 'SIN_REPARTO', label: 'Sin repartición' },
]

function rolLabel(rol: string): string {
  if (rol === 'ADMIN') return 'Administrador'
  if (rol === 'LECTURA') return 'Solo lectura'
  return 'Miembro'
}

export default function PerfilScreen() {
  const router = useRouter()
  const { user, logout, updateNombre, changePassword, refreshUsuario } = useAuth()
  const [nombreEdit, setNombreEdit] = useState(user?.nombre ?? '')
  const [guardando, setGuardando] = useState(false)
  const [mensajeError, setMensajeError] = useState<string | null>(null)
  const [mensajeOk, setMensajeOk] = useState<string | null>(null)
  const [passwordNueva, setPasswordNueva] = useState('')
  const [passwordConfirmar, setPasswordConfirmar] = useState('')
  const [cambiandoPassword, setCambiandoPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordOk, setPasswordOk] = useState<string | null>(null)
  const [sincronizandoSheets, setSincronizandoSheets] = useState(false)
  const [msgSheets, setMsgSheets] = useState<string | null>(null)
  const [errSheets, setErrSheets] = useState<string | null>(null)
  const { espacioActivo, esFamiliar, ocultarModulosFamiliares, setOcultarModulosFamiliares, setEspacioActivoId } = useEspacio()
  const [exportandoEspacio, setExportandoEspacio] = useState(false)
  const [importandoEspacio, setImportandoEspacio] = useState(false)
  const [msgEspacio, setMsgEspacio] = useState<string | null>(null)
  const [errEspacio, setErrEspacio] = useState<string | null>(null)
  const [modoReparto, setModoReparto] = useState<ModoReparto>('PROPORCIONAL')
  const [guardandoReparto, setGuardandoReparto] = useState(false)
  const [msgReparto, setMsgReparto] = useState<string | null>(null)
  const [errReparto, setErrReparto] = useState<string | null>(null)
  const [salirPrecheck, setSalirPrecheck] = useState<{ puede_salir: boolean; motivo: string } | null>(null)
  const [saliendoFamilia, setSaliendoFamilia] = useState(false)
  const [msgSalir, setMsgSalir] = useState<string | null>(null)
  const [errSalir, setErrSalir] = useState<string | null>(null)
  const [driveConnected, setDriveConnected] = useState(false)
  const [driveEmail, setDriveEmail] = useState('')
  const [driveLoading, setDriveLoading] = useState(true)
  const [driveConnecting, setDriveConnecting] = useState(false)
  const [driveBacking, setDriveBacking] = useState(false)
  const [msgDrive, setMsgDrive] = useState<string | null>(null)
  const [errDrive, setErrDrive] = useState<string | null>(null)

  useEffect(() => {
    driveApi.status()
      .then(({ data }) => { setDriveConnected(data.connected); setDriveEmail(data.email) })
      .catch(() => {})
      .finally(() => setDriveLoading(false))
  }, [])

  useEffect(() => {
    if (espacioActivo?.modo_reparto) {
      setModoReparto(espacioActivo.modo_reparto as ModoReparto)
    }
  }, [espacioActivo?.id, espacioActivo?.modo_reparto])

  useEffect(() => {
    if (!user?.familia) {
      setSalirPrecheck(null)
      return
    }
    familiaApi.salirFamiliaPrecheck()
      .then(({ data }) => setSalirPrecheck(data))
      .catch(() => setSalirPrecheck(null))
  }, [user?.familia?.id])

  const handleDriveConnect = async () => {
    setDriveConnecting(true)
    setMsgDrive(null)
    setErrDrive(null)
    try {
      const { data } = await driveApi.connect()
      await Linking.openURL(data.auth_url)
    } catch (e) {
      setErrDrive(apiErrorMessage(e) || 'No se pudo iniciar la conexión con Drive.')
    } finally {
      setDriveConnecting(false)
    }
  }

  const handleExportarEspacio = async () => {
    if (!espacioActivo || exportandoEspacio) return
    setExportandoEspacio(true)
    setMsgEspacio(null)
    setErrEspacio(null)
    try {
      const { data } = await espaciosApi.exportar(espacioActivo.id)
      const nombre = `respaldo_${espacioActivo.nombre.replace(/\s+/g, '_')}.json`
      const path = `${FileSystem.cacheDirectory}${nombre}`
      await FileSystem.writeAsStringAsync(path, JSON.stringify(data, null, 2))
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: 'Exportar respaldo' })
      }
      setMsgEspacio('Respaldo exportado.')
    } catch (e) {
      setErrEspacio(apiErrorMessage(e) || 'No se pudo exportar el espacio.')
    } finally {
      setExportandoEspacio(false)
    }
  }

  const handleImportarEspacio = async () => {
    if (!espacioActivo || importandoEspacio || espacioActivo.archivado) return
    setImportandoEspacio(true)
    setMsgEspacio(null)
    setErrEspacio(null)
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      })
      if (picked.canceled || !picked.assets?.[0]) {
        setImportandoEspacio(false)
        return
      }
      const asset = picked.assets[0]
      const content = await FileSystem.readAsStringAsync(asset.uri)
      const blob = new Blob([content], { type: 'application/json' })
      const { data } = await espaciosApi.importar(espacioActivo.id, blob, asset.name)
      setMsgEspacio(data.mensaje ?? 'Importación completada.')
    } catch (e) {
      setErrEspacio(apiErrorMessage(e) || 'No se pudo importar el respaldo.')
    } finally {
      setImportandoEspacio(false)
    }
  }

  const handleGuardarModoReparto = async () => {
    if (!espacioActivo || guardandoReparto) return
    setGuardandoReparto(true)
    setMsgReparto(null)
    setErrReparto(null)
    try {
      const { data } = await espaciosApi.actualizar(espacioActivo.id, { modo_reparto: modoReparto })
      setMsgReparto('Modo de reparto actualizado.')
      setModoReparto(data.modo_reparto)
      await refreshUsuario()
    } catch (e) {
      setErrReparto(apiErrorMessage(e) || 'No se pudo actualizar el modo de reparto.')
    } finally {
      setGuardandoReparto(false)
    }
  }

  const handleSalirFamilia = () => {
    Alert.alert(
      'Salir de la familia',
      'Se copiarán tus datos al espacio personal. ¿Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Salir',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setSaliendoFamilia(true)
              setMsgSalir(null)
              setErrSalir(null)
              try {
                await familiaApi.salirFamilia()
                await refreshUsuario()
                const personal = user?.espacios?.find(e => e.tipo === 'PERSONAL')
                if (personal) setEspacioActivoId(personal.id)
                setMsgSalir('Has salido de la familia.')
                setSalirPrecheck(null)
              } catch (e) {
                setErrSalir(apiErrorMessage(e) || 'No se pudo salir de la familia.')
              } finally {
                setSaliendoFamilia(false)
              }
            })()
          },
        },
      ],
    )
  }

  const handleDriveDisconnect = async () => {
    setMsgDrive(null)
    setErrDrive(null)
    try {
      await driveApi.disconnect()
      setDriveConnected(false)
      setDriveEmail('')
      setMsgDrive('Google Drive desconectado.')
    } catch (e) {
      setErrDrive(apiErrorMessage(e) || 'No se pudo desconectar Drive.')
    }
  }

  const handleDriveBackup = async () => {
    if (!espacioActivo || driveBacking) return
    setDriveBacking(true)
    setMsgDrive(null)
    setErrDrive(null)
    try {
      const { data } = await driveApi.backupEspacio(espacioActivo.id)
      const msg = `Respaldo subido: ${data.archivo.nombre}`
        + (data.eliminados > 0 ? ` (${data.eliminados} antiguo(s) eliminado(s))` : '')
      setMsgDrive(msg)
    } catch (e) {
      setErrDrive(apiErrorMessage(e) || 'No se pudo subir el respaldo a Drive.')
    } finally {
      setDriveBacking(false)
    }
  }

  if (!user) {
    return (
      <MobileShell title="Perfil">
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-muted text-sm">No hay sesión iniciada.</Text>
          <TouchableOpacity
            onPress={() => router.replace('/(auth)/login' as never)}
            className="mt-4 bg-dark px-4 py-3 rounded-xl"
          >
            <Text className="text-white font-semibold">Ir al login</Text>
          </TouchableOpacity>
        </View>
      </MobileShell>
    )
  }

  const nombreTrim = nombreEdit.trim()
  const nombreCambiado = user.nombre.trim() !== nombreTrim
  const puedeGuardar = nombreTrim.length > 0 && nombreCambiado && !guardando
  const inicial = user.nombre.trim().charAt(0).toUpperCase() || '?'

  const handleGuardar = async () => {
    if (!puedeGuardar) return
    setGuardando(true)
    setMensajeError(null)
    setMensajeOk(null)
    try {
      await updateNombre(nombreTrim)
      setMensajeOk('Nombre actualizado.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo actualizar el nombre.'
      setMensajeError(msg)
    } finally {
      setGuardando(false)
    }
  }

  const handleCambiarPassword = async () => {
    setPasswordError(null)
    setPasswordOk(null)
    if (passwordNueva.trim().length < 6) {
      setPasswordError('La nueva contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (passwordNueva !== passwordConfirmar) {
      setPasswordError('La confirmación no coincide con la nueva contraseña.')
      return
    }
    setCambiandoPassword(true)
    try {
      await changePassword(passwordNueva)
      setPasswordNueva('')
      setPasswordConfirmar('')
      setPasswordOk('Contraseña actualizada correctamente.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo cambiar la contraseña.'
      setPasswordError(msg)
    } finally {
      setCambiandoPassword(false)
    }
  }

  const handleSincronizarSheets = async () => {
    if (sincronizandoSheets) return
    setSincronizandoSheets(true)
    setMsgSheets(null)
    setErrSheets(null)
    try {
      const { data } = await exportApi.sincronizarGoogleSheets()
      if (data.ok && data.resumen?.length) {
        const total = data.resumen.reduce((a, r) => a + r.filas, 0)
        setMsgSheets(
          `Google Sheets: ${data.resumen.length} hoja(s), ${total} filas de datos.`
        )
      } else {
        setMsgSheets('Sincronización completada.')
      }
    } catch (err: unknown) {
      setErrSheets(apiErrorMessage(err) || 'No se pudo sincronizar con Google Sheets.')
    } finally {
      setSincronizandoSheets(false)
    }
  }

  return (
    <MobileShell title="Perfil">
      <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ padding: 20, paddingBottom: 28 }}>
        <TouchableOpacity
          onPress={() => router.back()}
          className="self-start rounded-lg border border-border px-3 py-2 mb-4"
        >
          <Text className="text-dark text-xs font-semibold">← Volver</Text>
        </TouchableOpacity>

        <View className="bg-white border border-border rounded-xl p-5 items-center mb-4">
          <View className="w-16 h-16 rounded-full bg-dark items-center justify-center mb-3">
            <Text className="text-accent text-xl font-bold">{inicial}</Text>
          </View>
          <Text className="text-dark font-bold text-lg">{user.nombre}</Text>
          <Text className="text-muted text-sm mt-1">{user.email}</Text>
          <View className="mt-3 px-3 py-1.5 rounded-full bg-dark/10 border border-dark/20">
            <Text className="text-dark text-xs font-semibold">{rolLabel(user.rol)}</Text>
          </View>
        </View>

        <View className="bg-white border border-border rounded-xl p-4 mb-4">
          <Text className="text-xs text-muted uppercase font-semibold tracking-wide mb-3">Información</Text>
          <Text className="text-xs text-muted font-semibold mb-1">Nombre</Text>
          <TextInput
            value={nombreEdit}
            onChangeText={setNombreEdit}
            className="border border-border rounded-lg px-3 py-2.5 text-dark mb-3"
          />
          <TouchableOpacity
            disabled={!puedeGuardar}
            onPress={handleGuardar}
            className={`rounded-xl py-3 items-center ${puedeGuardar ? 'bg-dark' : 'bg-border'}`}
          >
            {guardando ? (
              <ActivityIndicator color={puedeGuardar ? '#ffffff' : '#666666'} />
            ) : (
              <Text className={`font-semibold ${puedeGuardar ? 'text-white' : 'text-muted'}`}>Guardar</Text>
            )}
          </TouchableOpacity>
          {mensajeError && <Text className="text-danger text-xs mt-2">{mensajeError}</Text>}
          {mensajeOk && <Text className="text-success text-xs mt-2">{mensajeOk}</Text>}
        </View>

        <View className="bg-white border border-border rounded-xl p-4 mb-4">
          <Text className="text-xs text-muted uppercase font-semibold tracking-wide mb-3">Seguridad</Text>
          <TextInput
            value={passwordNueva}
            onChangeText={setPasswordNueva}
            secureTextEntry
            placeholder="Nueva contraseña"
            placeholderTextColor="#888884"
            className="border border-border rounded-lg px-3 py-2.5 text-dark mb-3"
          />
          <TextInput
            value={passwordConfirmar}
            onChangeText={setPasswordConfirmar}
            secureTextEntry
            placeholder="Confirmar contraseña"
            placeholderTextColor="#888884"
            className="border border-border rounded-lg px-3 py-2.5 text-dark mb-3"
          />
          <TouchableOpacity
            disabled={cambiandoPassword}
            onPress={handleCambiarPassword}
            className="rounded-xl py-3 items-center bg-dark"
          >
            {cambiandoPassword ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-white font-semibold">Cambiar contraseña</Text>
            )}
          </TouchableOpacity>
          {passwordError && <Text className="text-danger text-xs mt-2">{passwordError}</Text>}
          {passwordOk && <Text className="text-success text-xs mt-2">{passwordOk}</Text>}
        </View>

        <View className="bg-white border border-border rounded-xl p-4 mb-4">
          <Text className="text-xs text-muted uppercase font-semibold tracking-wide mb-3">Finanzas</Text>
          <TouchableOpacity
            onPress={() => router.push('/categorias' as never)}
            className="flex-row items-center justify-between py-3 border-b border-border"
          >
            <Text className="text-dark font-medium">Categorías</Text>
            <Text className="text-muted text-sm">›</Text>
          </TouchableOpacity>
        </View>

        <View className="bg-white border border-border rounded-xl p-4 mb-4">
          <Text className="text-xs text-muted uppercase font-semibold tracking-wide mb-3">Interfaz</Text>
          <View className="flex-row items-center justify-between">
            <Text className="text-dark text-sm flex-1 mr-3">Ocultar módulos familiares</Text>
            <Switch
              value={ocultarModulosFamiliares}
              onValueChange={setOcultarModulosFamiliares}
            />
          </View>
        </View>

        {espacioActivo && (
          <View className="bg-white border border-border rounded-xl p-4 mb-4">
            <Text className="text-xs text-muted uppercase font-semibold tracking-wide mb-3">Respaldo espacio</Text>
            <Text className="text-dark text-sm mb-3">
              Exporta o importa un JSON del espacio activo ({espacioActivo.nombre}).
            </Text>
            <TouchableOpacity
              disabled={exportandoEspacio}
              onPress={() => void handleExportarEspacio()}
              className={`rounded-xl py-3 items-center mb-2 ${exportandoEspacio ? 'bg-border' : 'bg-dark'}`}
            >
              {exportandoEspacio ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text className="text-white font-semibold">Exportar JSON</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              disabled={importandoEspacio || espacioActivo.archivado}
              onPress={() => void handleImportarEspacio()}
              className="rounded-xl py-3 items-center border border-border"
            >
              {importandoEspacio ? (
                <ActivityIndicator color="#666666" />
              ) : (
                <Text className="text-dark font-semibold">Importar JSON</Text>
              )}
            </TouchableOpacity>
            {msgEspacio ? <Text className="text-success text-xs mt-2">{msgEspacio}</Text> : null}
            {errEspacio ? <Text className="text-danger text-xs mt-2">{errEspacio}</Text> : null}
          </View>
        )}

        {esFamiliar && espacioActivo?.rol === 'ADMIN' && !espacioActivo?.archivado && (
          <View className="bg-white border border-border rounded-xl p-4 mb-4">
            <Text className="text-xs text-muted uppercase font-semibold tracking-wide mb-3">Reparto familiar</Text>
            <Text className="text-dark text-sm mb-3">Modo de reparto de gastos comunes.</Text>
            {MODOS_REPARTO.map(m => (
              <TouchableOpacity
                key={m.value}
                onPress={() => setModoReparto(m.value)}
                className={`rounded-lg px-3 py-2.5 mb-2 border ${modoReparto === m.value ? 'border-dark bg-dark/5' : 'border-border'}`}
              >
                <Text className={`text-sm ${modoReparto === m.value ? 'text-dark font-semibold' : 'text-muted'}`}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              disabled={guardandoReparto || modoReparto === espacioActivo?.modo_reparto}
              onPress={() => void handleGuardarModoReparto()}
              className={`rounded-xl py-3 items-center mt-1 ${guardandoReparto ? 'bg-border' : 'bg-dark'}`}
            >
              {guardandoReparto ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text className="text-white font-semibold">Guardar modo de reparto</Text>
              )}
            </TouchableOpacity>
            {msgReparto ? <Text className="text-success text-xs mt-2">{msgReparto}</Text> : null}
            {errReparto ? <Text className="text-danger text-xs mt-2">{errReparto}</Text> : null}
          </View>
        )}

        {user.familia && (
          <View className="bg-white border border-border rounded-xl p-4 mb-4">
            <Text className="text-xs text-muted uppercase font-semibold tracking-wide mb-3">Familia</Text>
            <Text className="text-dark text-sm mb-3">
              {salirPrecheck?.puede_salir
                ? 'Salir copiará tus datos al espacio personal.'
                : salirPrecheck?.motivo ?? 'Comprobando…'}
            </Text>
            <TouchableOpacity
              disabled={saliendoFamilia || salirPrecheck?.puede_salir === false}
              onPress={handleSalirFamilia}
              className="rounded-xl py-3 items-center border border-danger/40 bg-danger/5"
            >
              {saliendoFamilia ? (
                <ActivityIndicator color="#b42318" />
              ) : (
                <Text className="text-danger font-semibold">Salir de la familia</Text>
              )}
            </TouchableOpacity>
            {msgSalir ? <Text className="text-success text-xs mt-2">{msgSalir}</Text> : null}
            {errSalir ? <Text className="text-danger text-xs mt-2">{errSalir}</Text> : null}
          </View>
        )}

        {!driveLoading && (
          <View className="bg-white border border-border rounded-xl p-4 mb-4">
            <Text className="text-xs text-muted uppercase font-semibold tracking-wide mb-3">Google Drive</Text>
            {driveConnected ? (
              <>
                <Text className="text-dark text-sm mb-3">
                  Conectado como {driveEmail || '—'}. Los respaldos se guardan en "Finanzas App Backups".
                </Text>
                <TouchableOpacity
                  disabled={driveBacking || !espacioActivo}
                  onPress={() => void handleDriveBackup()}
                  className={`rounded-xl py-3 items-center mb-2 ${driveBacking ? 'bg-border' : 'bg-dark'}`}
                >
                  {driveBacking ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text className="text-white font-semibold">
                      Respaldar {espacioActivo?.nombre ?? 'espacio'}
                    </Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => void handleDriveDisconnect()}
                  className="rounded-xl py-3 items-center border border-border"
                >
                  <Text className="text-muted font-semibold">Desconectar</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text className="text-dark text-sm mb-3">
                  Conecta tu cuenta de Google para guardar respaldos en tu Drive personal.
                </Text>
                <TouchableOpacity
                  disabled={driveConnecting}
                  onPress={() => void handleDriveConnect()}
                  className={`rounded-xl py-3 items-center ${driveConnecting ? 'bg-border' : 'bg-dark'}`}
                >
                  {driveConnecting ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text className="text-white font-semibold">Conectar Google Drive</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
            {msgDrive ? <Text className="text-success text-xs mt-2">{msgDrive}</Text> : null}
            {errDrive ? <Text className="text-danger text-xs mt-2">{errDrive}</Text> : null}
          </View>
        )}

        {user.rol === 'ADMIN' ? (
          <View className="bg-white border border-border rounded-xl p-4 mb-4">
            <Text className="text-xs text-muted uppercase font-semibold tracking-wide mb-3">Respaldo</Text>
            <Text className="text-dark text-sm mb-3">
              Sincroniza los datos con el Google Sheet configurado en el servidor (igual que el respaldo
              automático).
            </Text>
            <TouchableOpacity
              disabled={sincronizandoSheets}
              onPress={() => void handleSincronizarSheets()}
              className={`rounded-xl py-3 items-center ${sincronizandoSheets ? 'bg-border' : 'bg-dark'}`}
            >
              {sincronizandoSheets ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text className="text-white font-semibold">Sincronizar con Google Sheets</Text>
              )}
            </TouchableOpacity>
            {msgSheets ? <Text className="text-success text-xs mt-2">{msgSheets}</Text> : null}
            {errSheets ? <Text className="text-danger text-xs mt-2">{errSheets}</Text> : null}
          </View>
        ) : null}

        <View className="bg-white border border-border rounded-xl p-4">
          <Text className="text-xs text-muted uppercase font-semibold tracking-wide mb-3">Sesión</Text>
          <TouchableOpacity onPress={() => void logout()} className="rounded-xl py-3 items-center border border-border">
            <Text className="text-dark font-semibold">Cerrar sesión</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </MobileShell>
  )
}
