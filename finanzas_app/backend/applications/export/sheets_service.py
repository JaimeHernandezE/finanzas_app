# Servicio para escribir datos en Google Sheets.
# Usa una Service Account con permisos de Editor en el sheet.

import os
import json

from google.oauth2 import service_account
from googleapiclient.discovery import build


SCOPES = ['https://www.googleapis.com/auth/spreadsheets']


def _rango_a1(nombre_hoja: str, celda_o_rango: str) -> str:
    """Notación A1 con el nombre de hoja entre comillas si hace falta."""
    esc = nombre_hoja.replace("'", "''")
    return f"'{esc}'!{celda_o_rango}"


def get_sheets_service():
    """
    Inicializa el cliente de Google Sheets usando las credenciales
    de la Service Account almacenadas como variable de entorno.
    """
    credentials_json = os.getenv('GOOGLE_SHEETS_CREDENTIALS_JSON')
    if not credentials_json:
        raise ValueError('GOOGLE_SHEETS_CREDENTIALS_JSON no está definida.')

    credentials_info = json.loads(credentials_json)
    credentials = service_account.Credentials.from_service_account_info(
        credentials_info,
        scopes=SCOPES,
    )
    return build('sheets', 'v4', credentials=credentials)


def limpiar_hoja(service, sheet_id: str, nombre_hoja: str):
    """Elimina todo el contenido de una hoja."""
    service.spreadsheets().values().clear(
        spreadsheetId=sheet_id,
        range=_rango_a1(nombre_hoja, 'A:ZZ'),
        body={},
    ).execute()


def escribir_hoja(service, sheet_id: str, nombre_hoja: str, filas: list[list]):
    """
    Escribe una lista de filas en la hoja especificada.
    La primera fila debe ser el encabezado.
    """
    if not filas:
        return

    service.spreadsheets().values().update(
        spreadsheetId=sheet_id,
        range=_rango_a1(nombre_hoja, 'A1'),
        valueInputOption='RAW',
        body={'values': filas},
    ).execute()


def asegurar_hoja(service, sheet_id: str, nombre_hoja: str):
    """
    Verifica que la hoja exista. Si no existe, la crea.
    """
    metadata = service.spreadsheets().get(
        spreadsheetId=sheet_id
    ).execute()

    hojas_existentes = [
        s['properties']['title']
        for s in metadata.get('sheets', [])
    ]

    if nombre_hoja not in hojas_existentes:
        service.spreadsheets().batchUpdate(
            spreadsheetId=sheet_id,
            body={
                'requests': [{
                    'addSheet': {
                        'properties': {'title': nombre_hoja}
                    }
                }]
            }
        ).execute()
