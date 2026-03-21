import { Tabs } from 'expo-router'
import { Text } from 'react-native'

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor:   '#0f0f0f',
        tabBarInactiveTintColor: '#aaaaaa',
        tabBarStyle: {
          borderTopColor: '#e8e8e4',
          backgroundColor: '#ffffff',
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>◈</Text>,
        }}
      />
      <Tabs.Screen
        name="gastos"
        options={{
          title: 'Gastos',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>⊕</Text>,
        }}
      />
      <Tabs.Screen
        name="liquidacion"
        options={{
          title: 'Resumen',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>⇄</Text>,
        }}
      />
    </Tabs>
  )
}
