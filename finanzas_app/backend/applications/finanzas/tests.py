import datetime
from decimal import Decimal
from unittest.mock import patch

from django.db import IntegrityError
from django.db.models.deletion import ProtectedError
from django.test import TestCase

from applications.usuarios.models import Familia, Usuario
from .models import (
    Categoria, CuentaPersonal, Cuota, IngresoComun,
    MetodoPago, Movimiento, Presupuesto, ResumenHistoricoMesSnapshot,
    Tarjeta,
)
from applications.finanzas import services_recalculo


# =============================================================================
# BASE COMPARTIDA
# =============================================================================

class FinanzasTestBase(TestCase):
    """Crea Familia, Usuario, Categoria y MetodoPago reutilizables."""

    def setUp(self):
        self.familia = Familia.objects.create(nombre='Familia Test')
        self.usuario = Usuario.objects.create_user(
            username='user@test.com',
            email='user@test.com',
            password='testpass',
            firebase_uid='uid_finanzas',
            familia=self.familia,
        )
        self.categoria_egreso = Categoria.objects.create(
            nombre='Alimentación',
            tipo='EGRESO',
            familia=self.familia,
        )
        self.metodo_efectivo = MetodoPago.objects.create(
            nombre='Efectivo',
            tipo='EFECTIVO',
        )
        self.metodo_credito = MetodoPago.objects.create(
            nombre='Visa',
            tipo='CREDITO',
        )


# =============================================================================
# CATEGORIA
# =============================================================================

class CategoriaModelTest(FinanzasTestBase):

    def test_categoria_global(self):
        c = Categoria.objects.create(nombre='Global', tipo='EGRESO')
        self.assertIsNone(c.familia)
        self.assertIsNone(c.usuario)

    def test_categoria_familiar(self):
        c = Categoria.objects.create(
            nombre='Familiar', tipo='EGRESO', familia=self.familia,
        )
        self.assertIsNotNone(c.familia)
        self.assertIsNone(c.usuario)

    def test_categoria_personal(self):
        c = Categoria.objects.create(
            nombre='Personal', tipo='EGRESO',
            familia=self.familia, usuario=self.usuario,
        )
        self.assertEqual(c.usuario, self.usuario)

    def test_categoria_es_inversion_default_false(self):
        c = Categoria.objects.create(nombre='X', tipo='EGRESO')
        self.assertFalse(c.es_inversion)


# =============================================================================
# METODO DE PAGO
# =============================================================================

class MetodoPagoModelTest(TestCase):

    def test_metodo_pago_str(self):
        m = MetodoPago.objects.create(nombre='Débito BCI', tipo='DEBITO')
        self.assertEqual(str(m), 'Débito BCI (DEBITO)')


# =============================================================================
# TARJETA
# =============================================================================

class TarjetaModelTest(FinanzasTestBase):

    def test_tarjeta_str(self):
        tarjeta = Tarjeta.objects.create(
            usuario=self.usuario,
            nombre='Visa BCI',
            banco='BCI',
        )
        self.assertIn('Visa BCI', str(tarjeta))


# =============================================================================
# CUENTA PERSONAL
# =============================================================================

class CuentaPersonalModelTest(FinanzasTestBase):

    def test_cuenta_personal_visible_familia_default_false(self):
        cuenta = CuentaPersonal.objects.create(
            nombre='Personal', usuario=self.usuario,
        )
        self.assertFalse(cuenta.visible_familia)


# =============================================================================
# MOVIMIENTO
# =============================================================================

class MovimientoModelTest(FinanzasTestBase):

    def _crear_movimiento(self, fecha=None, monto='1000.00'):
        return Movimiento.objects.create(
            familia=self.familia,
            usuario=self.usuario,
            tipo='EGRESO',
            ambito='PERSONAL',
            categoria=self.categoria_egreso,
            fecha=fecha or datetime.date(2026, 3, 1),
            monto=Decimal(monto),
            metodo_pago=self.metodo_efectivo,
        )

    def test_movimiento_creacion_efectivo(self):
        m = self._crear_movimiento()
        self.assertEqual(m.tipo, 'EGRESO')
        self.assertIsNone(m.tarjeta)
        self.assertIsNone(m.num_cuotas)

    def test_movimiento_str(self):
        m = self._crear_movimiento(monto='1000.00')
        s = str(m)
        self.assertIn('EGRESO', s)
        self.assertIn('1000', s)

    def test_movimiento_ordering_mas_reciente_primero(self):
        m1 = self._crear_movimiento(fecha=datetime.date(2026, 1, 1))
        m2 = self._crear_movimiento(fecha=datetime.date(2026, 3, 1))
        self.assertEqual(Movimiento.objects.first(), m2)

    def test_categoria_protege_borrado_con_movimientos(self):
        self._crear_movimiento()
        with self.assertRaises(ProtectedError):
            self.categoria_egreso.delete()


# =============================================================================
# CUOTA
# =============================================================================

class CuotaModelTest(FinanzasTestBase):
    """
    Usa movimiento en efectivo para cuotas manuales (evita duplicar las que
    genera el signal si fuera crédito).
    """

    def setUp(self):
        super().setUp()
        self.movimiento = Movimiento.objects.create(
            familia=self.familia,
            usuario=self.usuario,
            tipo='EGRESO',
            ambito='PERSONAL',
            categoria=self.categoria_egreso,
            fecha=datetime.date(2026, 3, 1),
            monto=Decimal('90000.00'),
            metodo_pago=self.metodo_efectivo,
        )

    def _crear_cuota(self, numero, mes=None):
        return Cuota.objects.create(
            movimiento=self.movimiento,
            numero=numero,
            monto=Decimal('30000.00'),
            mes_facturacion=mes or datetime.date(2026, 3, 1),
        )

    def test_cuota_estado_default_pendiente(self):
        cuota = self._crear_cuota(numero=1)
        self.assertEqual(cuota.estado, 'PENDIENTE')

    def test_cuota_incluir_default_true(self):
        cuota = self._crear_cuota(numero=1)
        self.assertTrue(cuota.incluir)

    def test_cuota_unique_together(self):
        self._crear_cuota(numero=1)
        with self.assertRaises(IntegrityError):
            self._crear_cuota(numero=1)

    def test_cuota_cascade_al_eliminar_movimiento(self):
        self._crear_cuota(numero=1)
        self._crear_cuota(numero=2, mes=datetime.date(2026, 4, 1))
        self.movimiento.delete()
        self.assertEqual(Cuota.objects.count(), 0)


# =============================================================================
# PRESUPUESTO
# =============================================================================

class PresupuestoModelTest(FinanzasTestBase):

    def test_presupuesto_unique_together(self):
        mes = datetime.date(2026, 3, 1)
        Presupuesto.objects.create(
            familia=self.familia,
            usuario=self.usuario,
            categoria=self.categoria_egreso,
            mes=mes,
            monto=Decimal('100000.00'),
        )
        with self.assertRaises(IntegrityError):
            Presupuesto.objects.create(
                familia=self.familia,
                usuario=self.usuario,
                categoria=self.categoria_egreso,
                mes=mes,
                monto=Decimal('200000.00'),
            )


# =============================================================================
# INGRESO COMUN
# =============================================================================

class IngresoComunModelTest(FinanzasTestBase):

    def test_ingreso_comun_ordering_mas_reciente_primero(self):
        IngresoComun.objects.create(
            familia=self.familia,
            usuario=self.usuario,
            mes=datetime.date(2026, 1, 1),
            monto=Decimal('1000000.00'),
        )
        IngresoComun.objects.create(
            familia=self.familia,
            usuario=self.usuario,
            mes=datetime.date(2026, 3, 1),
            monto=Decimal('1200000.00'),
        )
        primero = IngresoComun.objects.first()
        self.assertEqual(primero.mes, datetime.date(2026, 3, 1))


class UsuarioCuentaPersonalDefaultTest(FinanzasTestBase):
    """Al crear un usuario existe la cuenta personal «Personal»."""

    def test_cuenta_personal_por_defecto(self):
        cuenta = CuentaPersonal.objects.get(usuario=self.usuario, nombre='Personal')
        self.assertEqual(cuenta.usuario, self.usuario)


class IngresoComunMovimientoSignalTest(FinanzasTestBase):
    """IngresoComun genera Movimiento INGRESO en cuenta Personal."""

    def test_crea_movimiento_vinculado(self):
        from applications.finanzas.signals import CATEGORIA_INGRESO_DECLARADO_FONDO_COMUN

        ing = IngresoComun.objects.create(
            familia=self.familia,
            usuario=self.usuario,
            mes=datetime.date(2026, 3, 1),
            monto=Decimal('500000.00'),
            origen='Sueldo',
        )
        ing.refresh_from_db()
        self.assertIsNotNone(ing.movimiento_id)
        m = ing.movimiento
        self.assertEqual(m.tipo, 'INGRESO')
        self.assertEqual(m.ambito, 'PERSONAL')
        self.assertEqual(m.cuenta.nombre, 'Personal')
        self.assertEqual(m.comentario, 'Sueldo')
        self.assertEqual(m.monto, Decimal('500000.00'))
        self.assertEqual(m.fecha, datetime.date(2026, 3, 1))
        self.assertEqual(m.metodo_pago.tipo, 'EFECTIVO')
        self.assertEqual(m.categoria.nombre, CATEGORIA_INGRESO_DECLARADO_FONDO_COMUN)

    def test_editar_ingreso_actualiza_movimiento(self):
        ing = IngresoComun.objects.create(
            familia=self.familia,
            usuario=self.usuario,
            mes=datetime.date(2026, 3, 1),
            monto=Decimal('400000.00'),
            origen='A',
        )
        ing.monto = Decimal('600000.00')
        ing.origen = 'Bono'
        ing.save()
        ing.refresh_from_db()
        self.assertEqual(ing.movimiento.monto, Decimal('600000.00'))
        self.assertEqual(ing.movimiento.comentario, 'Bono')

    def test_eliminar_ingreso_elimina_movimiento(self):
        ing = IngresoComun.objects.create(
            familia=self.familia,
            usuario=self.usuario,
            mes=datetime.date(2026, 4, 1),
            monto=Decimal('100.00'),
        )
        mid = ing.movimiento_id
        ing.delete()
        self.assertFalse(Movimiento.objects.filter(pk=mid).exists())


class EfectivoDashboardFormulaTest(FinanzasTestBase):
    """efectivo_disponible_dashboard: resumen + snapshots personales − prorrateo + mes actual."""

    @patch('applications.finanzas.services_recalculo.timezone.localdate')
    def test_efectivo_suma_resumen_y_snapshots_resta_prorrateo(self, mock_hoy):
        mock_hoy.return_value = datetime.date(2026, 3, 15)
        uid = self.usuario.pk
        feb = datetime.date(2026, 2, 1)
        IngresoComun.objects.create(
            familia=self.familia,
            usuario=self.usuario,
            mes=feb,
            monto=Decimal('1000000.00'),
            origen='Sueldo',
        )
        payload = {
            'mes': 2,
            'anio': 2026,
            'sueldos_por_usuario': [],
            'compensacion': {
                'por_usuario': [
                    {
                        'usuario_id': uid,
                        'nombre': 'Test',
                        'pagado_efectivo': '0.00',
                        'gasto_prorrateado': '200000.00',
                        'diferencia': '0.00',
                    },
                ],
            },
        }
        ResumenHistoricoMesSnapshot.objects.create(
            familia=self.familia,
            mes=feb,
            payload=payload,
        )
        cuenta = CuentaPersonal.objects.get(usuario=self.usuario, nombre='Personal')
        Movimiento.objects.create(
            familia=self.familia,
            usuario=self.usuario,
            tipo='EGRESO',
            ambito='PERSONAL',
            cuenta=cuenta,
            categoria=self.categoria_egreso,
            fecha=datetime.date(2026, 2, 1),
            monto=Decimal('50000.00'),
            metodo_pago=self.metodo_efectivo,
        )
        datos = services_recalculo.efectivo_disponible_dashboard(self.usuario)
        # A=1_000_000, B=0 (sueldo mes actual), C=-50_000 (netos cuentas), D=200_000, E marzo=0
        esperado = Decimal('1000000.00') - Decimal('50000.00') - Decimal('200000.00')
        self.assertEqual(datos['efectivo'], esperado)
