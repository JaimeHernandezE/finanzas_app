import { CommonActions } from '@react-navigation/native'
import type { NavigationProp, ParamListBase } from '@react-navigation/native'
import type { Router } from 'expo-router'

export function esRutaNotificaciones(pathname: string): boolean {
  return pathname === '/notificaciones' || pathname.startsWith('/notificaciones/')
}

export function abrirNotificaciones(router: Router, pathname: string): void {
  if (esRutaNotificaciones(pathname)) return
  router.push('/notificaciones' as never)
}

/**
 * Cierra la pantalla de notificaciones aunque haya varias entradas duplicadas en el stack.
 */
export function cerrarNotificaciones(
  navigation: NavigationProp<ParamListBase>,
  router: Router,
): void {
  const state = navigation.getState()
  const routes = state.routes.filter((r) => r.name !== 'notificaciones')

  if (routes.length < state.routes.length) {
    navigation.dispatch(
      CommonActions.reset({
        ...state,
        routes,
        index: Math.max(0, routes.length - 1),
      }),
    )
    return
  }

  if (router.canGoBack()) {
    router.back()
    return
  }

  router.replace('/(tabs)' as never)
}
