import { View, Text, ScrollView } from 'react-native'

/**
 * Se muestra cuando el APK no incluye variables EXPO_PUBLIC_FIREBASE_*
 * (p. ej. build EAS sin secretos: `.env` no se sube al servidor).
 */
export function ConfiguracionFaltante() {
  return (
    <View className="flex-1 bg-dark justify-center px-6">
      <ScrollView>
        <Text className="text-white text-xl font-bold mb-3">
          Falta configuración del build
        </Text>
        <Text className="text-white/80 text-sm leading-6 mb-4">
          Este paquete no incluye las claves de Firebase. En builds con EAS hay que
          definir las variables EXPO_PUBLIC_FIREBASE_* como secretos del proyecto en
          expo.dev (o con eas secret:create) y volver a generar el APK.
        </Text>
        <Text className="text-white/50 text-xs leading-5">
          Copia los mismos valores que tienes en el archivo .env local de desarrollo.
        </Text>
      </ScrollView>
    </View>
  )
}
