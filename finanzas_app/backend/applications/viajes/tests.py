import datetime
from decimal import Decimal

from django.db import IntegrityError
from django.test import TestCase

from applications.usuarios.models import Familia, Usuario
from applications.finanzas.models import Categoria, MetodoPago, Movimiento
from .models import PresupuestoViaje, Viaje


# =============================================================================
# BASE COMPARTIDA
# =============================================================================

class ViajesTestBase(TestCase):

    def setUp(self):
        self.familia = Familia.objects.create(nombre='Familia Test')
        self.usuario = Usuario.objects.create_user(
            username='viaje@test.com',
            email='viaje@test.com',
            password='testpass',
            firebase_uid='uid_viajes',
            familia=self.familia,
        )
        self.viaje = Viaje.objects.create(
            familia=self.familia,
            nombre='Vacaciones Llanquihue 2026',
            fecha_inicio=datetime.date(2026, 2, 1),
            fecha_fin=datetime.date(2026, 2, 14),
        )


# =============================================================================
# VIAJE
# =============================================================================

class ViajeModelTest(ViajesTestBase):

    def test_viaje_es_activo_default_false(self):
        self.assertFalse(self.viaje.es_activo)

    def test_viaje_color_tema_opcional(self):
        viaje = Viaje.objects.create(
            familia=self.familia,
            nombre='Sin Color',
            fecha_inicio=datetime.date(2026, 3, 1),
            fecha_fin=datetime.date(2026, 3, 7),
        )
        self.assertEqual(viaje.color_tema, '')

    def test_viaje_str(self):
        self.assertEqual(str(self.viaje), 'Vacaciones Llanquihue 2026')

    def test_viaje_ordering_fecha_inicio_mas_reciente_primero(self):
        Viaje.objects.create(
            familia=self.familia,
            nombre='Viaje Antiguo',
            fecha_inicio=datetime.date(2024, 1, 1),
            fecha_fin=datetime.date(2024, 1, 7),
        )
        self.assertEqual(Viaje.objects.first(), self.viaje)


# =============================================================================
# PRESUPUESTO VIAJE
# =============================================================================

class PresupuestoViajeModelTest(ViajesTestBase):

    def setUp(self):
        super().setUp()
        self.categoria = Categoria.objects.create(
            nombre='Alojamiento', tipo='EGRESO', familia=self.familia,
        )

    def test_presupuesto_viaje_unique_together(self):
        PresupuestoViaje.objects.create(
            viaje=self.viaje,
            categoria=self.categoria,
            monto_planificado=Decimal('300000.00'),
        )
        with self.assertRaises(IntegrityError):
            PresupuestoViaje.objects.create(
                viaje=self.viaje,
                categoria=self.categoria,
                monto_planificado=Decimal('400000.00'),
            )

    def test_presupuesto_viaje_cascade_al_eliminar_viaje(self):
        PresupuestoViaje.objects.create(
            viaje=self.viaje,
            categoria=self.categoria,
            monto_planificado=Decimal('300000.00'),
        )
        self.viaje.delete()
        self.assertEqual(PresupuestoViaje.objects.count(), 0)

    def test_movimiento_asociado_a_viaje(self):
        metodo = MetodoPago.objects.create(nombre='Efectivo', tipo='EFECTIVO')
        movimiento = Movimiento.objects.create(
            familia=self.familia,
            usuario=self.usuario,
            tipo='EGRESO',
            ambito='COMUN',
            categoria=self.categoria,
            fecha=datetime.date(2026, 2, 5),
            monto=Decimal('50000.00'),
            metodo_pago=metodo,
            viaje=self.viaje,
        )
        self.assertEqual(movimiento.viaje, self.viaje)
        self.assertEqual(self.viaje.movimientos.count(), 1)
