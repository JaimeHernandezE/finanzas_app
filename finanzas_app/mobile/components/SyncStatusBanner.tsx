import { useEffect, useRef } from 'react'
import { ActivityIndicator, Animated, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  SYNC_BANNER_QUERY_KEY,
  type SyncBannerData,
} from '../lib/syncBannerState'

/**
 * Banner superior: Sincronizando → Sincronizado (u offline/error) y se oculta.
 * El estado vive en React Query para poder dispararse desde movimientosOffline.
 */
export function SyncStatusBanner() {
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const translateY = useRef(new Animated.Value(-120)).current

  const { data } = useQuery({
    queryKey: SYNC_BANNER_QUERY_KEY,
    queryFn: () => ({ phase: 'hidden' as const }) satisfies SyncBannerData,
    initialData:
      queryClient.getQueryData<SyncBannerData>(SYNC_BANNER_QUERY_KEY) ?? {
        phase: 'hidden',
      },
    staleTime: Infinity,
    gcTime: Infinity,
  })

  const phase = data?.phase ?? 'hidden'

  useEffect(() => {
    if (phase === 'hidden') {
      Animated.timing(translateY, {
        toValue: -120,
        duration: 280,
        useNativeDriver: true,
      }).start()
      return
    }
    Animated.spring(translateY, {
      toValue: 0,
      friction: 9,
      useNativeDriver: true,
    }).start()
  }, [phase, translateY])

  const visible = phase !== 'hidden'

  const copy =
    phase === 'syncing'
      ? { title: 'Sincronizando', showSpinner: true, showCheck: false }
      : phase === 'synced'
        ? { title: 'Sincronizado', showSpinner: false, showCheck: true }
        : phase === 'offline'
          ? {
              title: 'Sin conexión — se sincronizará al volver internet',
              showSpinner: false,
              showCheck: false,
            }
          : phase === 'error'
            ? {
                title: 'No se pudo guardar el movimiento',
                showSpinner: false,
                showCheck: false,
              }
            : { title: '', showSpinner: false, showCheck: false }

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        zIndex: 9999,
        transform: [{ translateY }],
      }}
      accessibilityLiveRegion="polite"
    >
      {visible && (
        <View
          style={{
            marginHorizontal: 12,
            marginTop: insets.top + 8,
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderRadius: 12,
            backgroundColor: '#0f0f0f',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.2,
            shadowRadius: 6,
            elevation: 6,
          }}
        >
          {copy.showSpinner && <ActivityIndicator color="#fbbf24" size="small" />}
          {copy.showCheck && (
            <Text style={{ color: '#4ade80', fontSize: 18, fontWeight: '700' }}>✓</Text>
          )}
          <Text style={{ color: '#fafafa', fontSize: 14, fontWeight: '600', flex: 1 }}>
            {copy.title}
          </Text>
        </View>
      )}
    </Animated.View>
  )
}
