import datetime
from decimal import Decimal

from django.db import IntegrityError
from django.test import TestCase

from applications.usuarios.models import Familia, Usuario
from .models import Aporte, Fondo, RegistroValor


# =============================================================================
# BASE COMPARTIDA
# =============================================================================

class InversionesTestBase(TestCase):

    def setUp(self):
        self.familia = Familia.objects.create(nombre='Familia Test')
        self.usuario = Usuario.objects.create_user(
            username='inv@test.com',
            email='inv@test.com',
            password='testpass',
            firebase_uid='uid_inversiones',
            familia=self.familia,
        )


# =============================================================================
# FONDO
# =============================================================================

class FondoModelTest(InversionesTestBase):

    def test_fondo_familiar_usuario_null(self):
        fondo = Fondo.objects.create(nombre='APV Familia', familia=self.familia)
        self.assertIsNone(fondo.usuario)

    def test_fondo_personal(self):
        fondo = Fondo.objects.create(
            nombre='APV Personal', familia=self.familia, usuario=self.usuario,
        )
        self.assertEqual(fondo.usuario, self.usuario)


# =============================================================================
# APORTE
# =============================================================================

class AporteModelTest(InversionesTestBase):

    def setUp(self):
        super().setUp()
        self.fondo = Fondo.objects.create(nombre='APV', familia=self.familia)

    def test_aporte_str(self):
        aporte = Aporte.objects.create(
            fondo=self.fondo,
            fecha=datetime.date(2026, 3, 1),
            monto=Decimal('100000.00'),
        )
        s = str(aporte)
        self.assertIn('100000', s)
        self.assertIn('APV', s)

    def test_aporte_ordering_mas_reciente_primero(self):
        Aporte.objects.create(
            fondo=self.fondo, fecha=datetime.date(2026, 1, 1), monto=Decimal('50000.00'),
        )
        Aporte.objects.create(
            fondo=self.fondo, fecha=datetime.date(2026, 3, 1), monto=Decimal('80000.00'),
        )
        primero = Aporte.objects.first()
        self.assertEqual(primero.fecha, datetime.date(2026, 3, 1))

    def test_aporte_cascade_al_eliminar_fondo(self):
        Aporte.objects.create(
            fondo=self.fondo, fecha=datetime.date(2026, 3, 1), monto=Decimal('50000.00'),
        )
        self.fondo.delete()
        self.assertEqual(Aporte.objects.count(), 0)


# =============================================================================
# REGISTRO VALOR
# =============================================================================

class RegistroValorModelTest(InversionesTestBase):

    def setUp(self):
        super().setUp()
        self.fondo = Fondo.objects.create(nombre='APV', familia=self.familia)

    def test_registro_valor_str(self):
        rv = RegistroValor.objects.create(
            fondo=self.fondo,
            fecha=datetime.date(2026, 3, 1),
            valor_cuota=Decimal('1234.567890'),
        )
        s = str(rv)
        self.assertIn('APV', s)
        self.assertIn('2026-03-01', s)

    def test_registro_valor_unique_together(self):
        fecha = datetime.date(2026, 3, 1)
        RegistroValor.objects.create(
            fondo=self.fondo, fecha=fecha, valor_cuota=Decimal('1000.000000'),
        )
        with self.assertRaises(IntegrityError):
            RegistroValor.objects.create(
                fondo=self.fondo, fecha=fecha, valor_cuota=Decimal('1100.000000'),
            )

    def test_registro_valor_ordering_mas_reciente_primero(self):
        RegistroValor.objects.create(
            fondo=self.fondo, fecha=datetime.date(2026, 1, 1), valor_cuota=Decimal('1000.000000'),
        )
        RegistroValor.objects.create(
            fondo=self.fondo, fecha=datetime.date(2026, 3, 1), valor_cuota=Decimal('1100.000000'),
        )
        primero = RegistroValor.objects.first()
        self.assertEqual(primero.fecha, datetime.date(2026, 3, 1))
