from django.contrib.auth.models import AbstractUser
from django.db import models


class Usuario(AbstractUser):
    firebase_uid = models.CharField(max_length=128, blank=True, null=True, unique=True)

    def __str__(self):
        return self.email or self.username
