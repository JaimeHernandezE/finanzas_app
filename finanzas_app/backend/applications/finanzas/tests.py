import datetime
from decimal import Decimal

from django.db import IntegrityError
from django.db.models.deletion import ProtectedError
from django.test import TestCase

from applications.usuarios.models import Familia, Usuario
from .models import (
    Categoria, CuentaPersonal, Cuota, IngresoComun,
    MetodoPago, Movimiento, Presupuesto, Tarjeta,
)


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

    def setUp(self):
        super().setUp()
        tarjeta = Tarjeta.objects.create(
            usuario=self.usuario, nombre='Visa', banco='BCI',
        )
        self.movimiento = Movimiento.objects.create(
            familia=self.familia,
            usuario=self.usuario,
            tipo='EGRESO',
            ambito='PERSONAL',
            categoria=self.categoria_egreso,
            fecha=datetime.date(2026, 3, 1),
            monto=Decimal('90000.00'),
            metodo_pago=self.metodo_credito,
            tarjeta=tarjeta,
            num_cuotas=3,
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
            categoria=self.categoria_egreso,
            mes=mes,
            monto=Decimal('100000.00'),
        )
        with self.assertRaises(IntegrityError):
            Presupuesto.objects.create(
                familia=self.familia,
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
