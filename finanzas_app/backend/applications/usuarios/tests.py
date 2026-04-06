import datetime

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from .demo_constants import (
    DEMO_EMAIL_GLORI,
    DEMO_EMAIL_JAIME,
    DEMO_FIREBASE_UID_GLORI,
    DEMO_FIREBASE_UID_JAIME,
    FAMILIA_DEMO_NOMBRE,
)
from .models import Familia, Usuario


# =============================================================================
# FAMILIA
# =============================================================================

class FamiliaModelTest(TestCase):

    def test_familia_str(self):
        familia = Familia.objects.create(nombre='Los García')
        self.assertEqual(str(familia), 'Los García')


# =============================================================================
# USUARIO
# =============================================================================

class UsuarioModelTest(TestCase):

    def setUp(self):
        self.familia = Familia.objects.create(nombre='Los García')

    def _crear_usuario(self, uid='uid_test', username='user@test.com',
                       nombre='', apellido=''):
        usuario = Usuario.objects.create_user(
            username=username,
            email=username,
            password='testpass',
            firebase_uid=uid,
            familia=self.familia,
        )
        if nombre:
            usuario.first_name = nombre
            usuario.last_name = apellido
            usuario.save()
        return usuario

    def test_usuario_rol_por_defecto(self):
        usuario = self._crear_usuario()
        self.assertEqual(usuario.rol, 'MIEMBRO')

    def test_usuario_str_nombre_completo(self):
        usuario = self._crear_usuario(nombre='Jaime', apellido='Hernández')
        self.assertEqual(str(usuario), 'Jaime Hernández')

    def test_usuario_str_fallback_username(self):
        usuario = self._crear_usuario(username='jaime@test.com')
        self.assertEqual(str(usuario), 'jaime@test.com')

    def test_usuario_sin_familia_es_valido(self):
        usuario = Usuario.objects.create_user(
            username='solo@test.com',
            email='solo@test.com',
            password='testpass',
            firebase_uid='uid_sin_familia',
        )
        self.assertIsNone(usuario.familia)


# =============================================================================
# VIEW: demo-login
# =============================================================================

class DemoLoginViewTest(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.url = reverse('demo-login')
        familia = Familia.objects.create(nombre=FAMILIA_DEMO_NOMBRE)
        Usuario.objects.create_user(
            username=DEMO_EMAIL_JAIME,
            email=DEMO_EMAIL_JAIME,
            password='unused',
            firebase_uid=DEMO_FIREBASE_UID_JAIME,
            familia=familia,
            rol='ADMIN',
            first_name='Jaime',
            last_name='Demo',
        )
        Usuario.objects.create_user(
            username=DEMO_EMAIL_GLORI,
            email=DEMO_EMAIL_GLORI,
            password='unused',
            firebase_uid=DEMO_FIREBASE_UID_GLORI,
            familia=familia,
            rol='MIEMBRO',
            first_name='Glori',
            last_name='Demo',
        )

    def test_demo_login_requiere_demo_true(self):
        from django.test import override_settings

        with override_settings(DEMO=False):
            r = self.client.post(self.url, {'usuario': 'jaime'}, format='json')
        self.assertEqual(r.status_code, 403)

    def test_demo_login_jaime_retorna_jwt(self):
        from django.test import override_settings

        with override_settings(DEMO=True):
            r = self.client.post(self.url, {'usuario': 'jaime'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertIn('access', r.data)
        self.assertIn('refresh', r.data)
        self.assertEqual(r.data['usuario']['email'], DEMO_EMAIL_JAIME)
        self.assertTrue(r.data['usuario']['es_demo'])

    def test_demo_login_glori(self):
        from django.test import override_settings

        with override_settings(DEMO=True):
            r = self.client.post(self.url, {'usuario': 'glori'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['usuario']['email'], DEMO_EMAIL_GLORI)
