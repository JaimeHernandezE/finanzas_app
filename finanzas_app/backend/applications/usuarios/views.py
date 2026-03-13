from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
from .models import Usuario

# NOTA: Necesitarás descargar tu archivo .json de claves de servicio de Firebase
# y colocarlo en el backend (asegúrate de ponerlo en el .gitignore).
# Por ahora, inicializaremos Firebase con un try/except para que no falle al arrancar.

try:
    import firebase_admin
    from firebase_admin import credentials, auth
    # cred = credentials.Certificate('ruta/a/tu/firebase-adminsdk.json')
    # firebase_admin.initialize_app(cred)
except Exception as e:
    print(f"Error inicializando Firebase: {e}")


class FirebaseLoginView(APIView):
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        firebase_token = request.data.get('firebase_token')

        if not firebase_token:
            return Response(
                {'error': 'Token de Firebase requerido'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # 1. Verificar el token con Firebase
            # decoded_token = auth.verify_id_token(firebase_token)
            # uid = decoded_token['uid']
            # email = decoded_token.get('email', '')

            # MOCK PARA DESARROLLO (Mientras configuras Firebase real)
            uid = "fake_firebase_uid_123"
            email = "jaime@ejemplo.com"

            # 2. Buscar o crear el usuario en Django
            usuario, created = Usuario.objects.get_or_create(
                firebase_uid=uid,
                defaults={
                    'username': email,
                    'email': email,
                }
            )

            # 3. Generar token JWT de Django
            refresh = RefreshToken.for_user(usuario)

            return Response({
                'refresh': str(refresh),
                'access': str(refresh.access_token),
                'usuario': {
                    'id': usuario.id,
                    'email': usuario.email,
                    'nuevo_registro': created
                }
            }, status=status.HTTP_200_OK)

        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_401_UNAUTHORIZED)
