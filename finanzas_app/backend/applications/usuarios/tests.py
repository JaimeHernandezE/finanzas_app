from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from unittest.mock import patch, MagicMock

from .models import Usuario


# ---------------------------------------------------------------------------
# Model tests
# ---------------------------------------------------------------------------

class UsuarioModelTest(TestCase):
    """Tests for the Usuario model."""

    def test_str_returns_email_when_set(self):
        user = Usuario(username="testuser", email="test@example.com")
        self.assertEqual(str(user), "test@example.com")

    def test_str_returns_username_when_email_is_empty(self):
        user = Usuario(username="testuser", email="")
        self.assertEqual(str(user), "testuser")

    def test_firebase_uid_can_be_null(self):
        user = Usuario.objects.create_user(
            username="no_firebase",
            email="no@firebase.com",
            password="pass123",
            firebase_uid=None,
        )
        self.assertIsNone(user.firebase_uid)

    def test_firebase_uid_is_unique(self):
        Usuario.objects.create_user(
            username="user1",
            email="user1@example.com",
            password="pass123",
            firebase_uid="unique_uid_001",
        )
        with self.assertRaises(Exception):
            Usuario.objects.create_user(
                username="user2",
                email="user2@example.com",
                password="pass123",
                firebase_uid="unique_uid_001",  # duplicate
            )

    def test_firebase_uid_max_length(self):
        long_uid = "x" * 128
        user = Usuario.objects.create_user(
            username="longuid",
            email="longuid@example.com",
            password="pass123",
            firebase_uid=long_uid,
        )
        self.assertEqual(user.firebase_uid, long_uid)


# ---------------------------------------------------------------------------
# URL tests
# ---------------------------------------------------------------------------

class UsuarioUrlTest(TestCase):
    """Verify URL routing resolves correctly."""

    def test_firebase_login_url_resolves(self):
        url = reverse("firebase-login")
        self.assertEqual(url, "/api/usuarios/auth/firebase/")


# ---------------------------------------------------------------------------
# FirebaseLoginView tests
# ---------------------------------------------------------------------------

class FirebaseLoginViewTest(APITestCase):
    """Tests for POST /api/usuarios/auth/firebase/"""

    URL = "/api/usuarios/auth/firebase/"

    # --- Validation ---

    def test_missing_token_returns_400(self):
        response = self.client.post(self.URL, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("error", response.data)

    def test_empty_token_returns_400(self):
        response = self.client.post(self.URL, {"firebase_token": ""}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # --- Success: new user ---

    def test_valid_token_creates_new_user_and_returns_200(self):
        response = self.client.post(
            self.URL, {"firebase_token": "valid_token"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_response_contains_jwt_tokens(self):
        response = self.client.post(
            self.URL, {"firebase_token": "valid_token"}, format="json"
        )
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_response_contains_user_info(self):
        response = self.client.post(
            self.URL, {"firebase_token": "valid_token"}, format="json"
        )
        usuario = response.data["usuario"]
        self.assertIn("id", usuario)
        self.assertIn("email", usuario)
        self.assertIn("nuevo_registro", usuario)

    def test_nuevo_registro_is_true_for_new_user(self):
        response = self.client.post(
            self.URL, {"firebase_token": "valid_token"}, format="json"
        )
        self.assertTrue(response.data["usuario"]["nuevo_registro"])

    # --- Success: existing user ---

    def test_existing_user_returns_200_without_creating_duplicate(self):
        # Create the user that the mock UID maps to
        Usuario.objects.create_user(
            username="jaime@ejemplo.com",
            email="jaime@ejemplo.com",
            password="",
            firebase_uid="fake_firebase_uid_123",
        )
        response = self.client.post(
            self.URL, {"firebase_token": "any_token"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Usuario.objects.count(), 1)

    def test_nuevo_registro_is_false_for_existing_user(self):
        Usuario.objects.create_user(
            username="jaime@ejemplo.com",
            email="jaime@ejemplo.com",
            password="",
            firebase_uid="fake_firebase_uid_123",
        )
        response = self.client.post(
            self.URL, {"firebase_token": "any_token"}, format="json"
        )
        self.assertFalse(response.data["usuario"]["nuevo_registro"])

    # --- Error handling ---

    def test_internal_exception_returns_401(self):
        """If get_or_create raises, the view must return 401."""
        with patch(
            "applications.usuarios.views.Usuario.objects.get_or_create",
            side_effect=Exception("DB error"),
        ):
            response = self.client.post(
                self.URL, {"firebase_token": "valid_token"}, format="json"
            )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn("error", response.data)
