import { BrowserRouter, Routes, Route } from 'react-router-dom'
import MainLayout from '@/components/layout/MainLayout'

function Placeholder({ title }: { title: string }) {
  return (
    <div style={{ padding: '2rem' }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#111' }}>{title}</h2>
      <p style={{ marginTop: '0.5rem', color: '#6b7280', fontSize: '0.875rem' }}>
        Página en construcción.
      </p>
    </div>
  )
}
import DashboardPage from '@/pages/dashboard/DashboardPage'
import MovimientosPage from '@/pages/gastos/MovimientosPage'
import MovimientoFormPage from '@/pages/gastos/MovimientoFormPage'
import CuentaPage from '@/pages/gastos/CuentaPage'
import TarjetasPage from '@/pages/tarjetas/TarjetasPage'
import LiquidacionPage from '@/pages/liquidacion/LiquidacionPage'
import PresupuestoPage from '@/pages/presupuesto/PresupuestoPage'
import InversionesPage from '@/pages/inversiones/InversionesPage'
import FondoDetallePage from '@/pages/inversiones/FondoDetallePage'
import ViajesPage from '@/pages/viajes/ViajesPage'
import ViajeFormPage from '@/pages/viajes/ViajeFormPage'
import ViajeDetallePage from '@/pages/viajes/ViajeDetallePage'
import ConfiguracionPage from '@/pages/configuracion/ConfiguracionPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route index element={<DashboardPage />} />

          <Route path="gastos">
            <Route index element={<MovimientosPage />} />
            <Route path="comunes"    element={<Placeholder title="Gastos comunes" />} />
            <Route path="cuenta/:id" element={<CuentaPage />} />
            <Route path="nuevo"      element={<MovimientoFormPage />} />
            <Route path=":id"        element={<MovimientoFormPage />} />
            <Route path=":id/editar" element={<Placeholder title="Editar movimiento" />} />
          </Route>

          <Route path="sueldos" element={<Placeholder title="Sueldos" />} />

          <Route path="tarjetas">
            <Route index element={<TarjetasPage />} />
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
          </Route>

          <Route path="configuracion" element={<ConfiguracionPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
