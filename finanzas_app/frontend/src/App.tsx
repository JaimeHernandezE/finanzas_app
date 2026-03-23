import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from '@/components/layout/MainLayout'
import { ConfigProvider } from '@/context/ConfigContext'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { ViajeProvider } from '@/context/ViajeContext'
import { PantallaCarga } from '@/components/ui/PantallaCarga'
import { RutaProtegida } from '@/components/auth/RutaProtegida'
import LandingPage from '@/pages/public/LandingPage'
import LoginPage from '@/pages/login/LoginPage'
import DashboardPage from '@/pages/dashboard/DashboardPage'
import MovimientosPage from '@/pages/gastos/MovimientosPage'
import MovimientoFormPage from '@/pages/gastos/MovimientoFormPage'
import MovimientoEditarPage from '@/pages/gastos/MovimientoEditarPage'
import CuentaPage from '@/pages/gastos/CuentaPage'
import GastosComunesPage from '@/pages/gastos/GastosComunesPage'
import TarjetasPage from '@/pages/tarjetas/TarjetasPage'
import PagarTarjetaPage from '@/pages/tarjetas/PagarTarjetaPage'
import LiquidacionPage from '@/pages/liquidacion/LiquidacionPage'
import SueldosPage from '@/pages/sueldos/SueldosPage'
import PresupuestoPage from '@/pages/presupuesto/PresupuestoPage'
import InversionesPage from '@/pages/inversiones/InversionesPage'
import FondoDetallePage from '@/pages/inversiones/FondoDetallePage'
import ViajesPage from '@/pages/viajes/ViajesPage'
import ViajeFormPage from '@/pages/viajes/ViajeFormPage'
import ViajeDetallePage from '@/pages/viajes/ViajeDetallePage'
import ConfiguracionLayout from '@/pages/configuracion/ConfiguracionLayout'
import ConfiguracionPage from '@/pages/configuracion/ConfiguracionPage'
import CategoriasPage from '@/pages/configuracion/CategoriasPage'
import CuentasPage from '@/pages/configuracion/CuentasPage'
import MiembrosPage from '@/pages/configuracion/MiembrosPage'
import PerfilPage from '@/pages/configuracion/PerfilPage'

const Placeholder = ({ title }: { title: string }) => (
  <div style={{ padding: '40px 32px', color: '#888' }}>
    <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f0f0f', marginBottom: 8 }}>{title}</h2>
    <p style={{ fontSize: 14 }}>Vista en construccion</p>
  </div>
)

function AppRoutes() {
  const { usuario, loading } = useAuth()

  if (loading) return <PantallaCarga />

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={usuario ? <Navigate to="/dashboard" replace /> : <LoginPage />} />

      <Route
        element={
          <RutaProtegida>
            <MainLayout />
          </RutaProtegida>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />

        <Route path="gastos">
          <Route index element={<MovimientosPage />} />
          <Route path="comunes" element={<GastosComunesPage />} />
          <Route path="cuenta/:id" element={<CuentaPage />} />
          <Route path="nuevo" element={<MovimientoFormPage />} />
          <Route path=":id" element={<MovimientoFormPage />} />
          <Route path=":id/editar" element={<MovimientoEditarPage />} />
        </Route>

        <Route path="sueldos" element={<SueldosPage />} />

        <Route path="tarjetas">
          <Route index element={<TarjetasPage />} />
          <Route path="pagar" element={<PagarTarjetaPage />} />
          <Route path="gestionar" element={<Placeholder title="Gestionar tarjetas" />} />
        </Route>

        <Route path="liquidacion" element={<LiquidacionPage />} />
        <Route path="presupuesto" element={<PresupuestoPage />} />

        <Route path="inversiones">
          <Route index element={<InversionesPage />} />
          <Route path=":id" element={<FondoDetallePage />} />
        </Route>

        <Route path="viajes">
          <Route index element={<ViajesPage />} />
          <Route path="nuevo" element={<ViajeFormPage />} />
          <Route path=":id" element={<ViajeDetallePage />} />
          <Route path=":id/editar" element={<ViajeFormPage />} />
        </Route>

        <Route path="configuracion" element={<ConfiguracionLayout />}>
          <Route index element={<ConfiguracionPage />} />
          <Route path="perfil" element={<PerfilPage />} />
          <Route path="categorias" element={<CategoriasPage />} />
          <Route path="cuentas" element={<CuentasPage />} />
          <Route path="miembros" element={<MiembrosPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <ConfigProvider>
      <BrowserRouter>
        <AuthProvider>
          <ViajeProvider>
            <AppRoutes />
          </ViajeProvider>
        </AuthProvider>
      </BrowserRouter>
    </ConfigProvider>
  )
}
