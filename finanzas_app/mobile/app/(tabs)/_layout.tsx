import { Tabs } from 'expo-router'
import { Platform, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function TabsLayout() {
  const insets = useSafeAreaInsets()
  const tabBarBottom = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 8)

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor:   '#c8f060',
        tabBarInactiveTintColor: '#a9a9a4',
        tabBarStyle: {
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: tabBarBottom,
          borderTopColor: '#202020',
          borderTopWidth: 1,
          backgroundColor: '#0f0f0f',
          height: 66,
          borderRadius: 16,
          paddingTop: 8,
          paddingBottom: 8,
        },
        sceneStyle: { paddingBottom: 98 + tabBarBottom },
        tabBarLabelStyle: {
          fontSize: 13,
          fontWeight: '600',
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>◈</Text>,
        }}
      />
      <Tabs.Screen
        name="gastos"
        options={{
          title: 'Gastos comunes',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>⊕</Text>,
        }}
      />
      <Tabs.Screen
        name="liquidacion"
        options={{
          title: 'Resumen común',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>⇄</Text>,
        }}
      />
    </Tabs>
  )
}
