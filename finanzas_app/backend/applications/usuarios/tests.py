import datetime

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

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
# VIEW: FirebaseLoginView
# =============================================================================

class FirebaseLoginViewTest(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.url = reverse('firebase_login')

    def test_firebase_login_sin_token_retorna_400(self):
        response = self.client.post(self.url, {}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.data)

    def test_firebase_login_retorna_tokens_y_datos_de_usuario(self):
        response = self.client.post(
            self.url, {'firebase_token': 'cualquier_token'}, format='json'
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertIn('id', response.data['usuario'])
        self.assertIn('email', response.data['usuario'])

    def test_firebase_login_usuario_existente_no_duplica(self):
        self.client.post(self.url, {'firebase_token': 'token'}, format='json')
        self.client.post(self.url, {'firebase_token': 'token'}, format='json')
        self.assertEqual(Usuario.objects.count(), 1)

    def test_firebase_login_nuevo_registro_flag(self):
        r1 = self.client.post(self.url, {'firebase_token': 'token'}, format='json')
        r2 = self.client.post(self.url, {'firebase_token': 'token'}, format='json')
        self.assertTrue(r1.data['usuario']['nuevo_registro'])
        self.assertFalse(r2.data['usuario']['nuevo_registro'])
