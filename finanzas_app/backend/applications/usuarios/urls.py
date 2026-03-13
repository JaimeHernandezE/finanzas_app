from django.urls import path
from .views import FirebaseLoginView

urlpatterns = [
    path('auth/firebase/', FirebaseLoginView.as_view(), name='firebase_login'),
]
