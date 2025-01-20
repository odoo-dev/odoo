# Part of Odoo. See LICENSE file for full copyright and licensing details.
import base64
import hashlib
import hmac
import json
from urllib.parse import urljoin

import requests
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.serialization import (
    load_der_private_key,
    load_der_public_key,
)

BASE_DOMAIN = "https://eis-cert.bir.gov.ph/"
TIMEOUT = 60

# ----------
# Encryption
# ----------

AES_BLOCK_SIZE = 16


def _encrypt_aes256(payload, key):
    """ Given a key and a payload, encrypt the payload using AES256/CBC. """
    def _pad(payload_to_pad):
        length = AES_BLOCK_SIZE - (len(payload_to_pad) % AES_BLOCK_SIZE)
        return payload_to_pad + chr(length) * length

    iv = key[:AES_BLOCK_SIZE]
    cipher = Cipher(algorithms.AES256(key.encode()), modes.CBC(iv.encode()))
    encryptor = cipher.encryptor()
    return encryptor.update(_pad(payload).encode()) + encryptor.finalize()


def _decrypt_aes256(payload, key):
    """ Given a key and a payload, decrypt the payload using AES256/CBC. """
    def _unpad(payload_to_unpad):
        return payload_to_unpad[:-ord(payload_to_unpad[len(payload_to_unpad)-1:])]

    iv = key[:AES_BLOCK_SIZE]
    cipher = Cipher(algorithms.AES256(key.encode()), modes.CBC(iv.encode()))
    decryptor = cipher.decryptor()
    return _unpad(decryptor.update(payload) + decryptor.finalize())


def _encrypt_rsa(payload, der_public_key):
    public_key = load_der_public_key(base64.b64decode(der_public_key), default_backend())
    return public_key.encrypt(
        payload,
        padding.PKCS1v15()
    )


def _decrypt_rsa(payload, der_private_key, password=None):
    private_key = load_der_private_key(base64.b64decode(der_private_key), password, default_backend())
    return private_key.decrypt(
        payload,
        padding.PKCS1v15()
    )


def _sign_jws_hs256(payload, key, headers=None):
    headers = headers or {}
    headers = json.dumps({"typ": "JWT", "alg": "HS256", **headers})
    JOSE_header = base64.urlsafe_b64encode(headers.encode()).decode().strip("=")
    payload = json.dumps(payload)
    encoded_payload = base64.urlsafe_b64encode(payload.encode()).decode().strip("=")
    unsigned_token = "{}.{}".format(JOSE_header, encoded_payload)
    key_decoded = base64.urlsafe_b64decode(key + "==")

    signature = hmac.new(key_decoded, unsigned_token.encode(), hashlib.sha256).digest()
    sig = base64.urlsafe_b64encode(signature).decode().strip("=")

    return "{}.{}".format(unsigned_token, sig)

# ---
# API
# ---


def _request_eis(env, method, endpoint, headers, json_data):
    """ Helper to query the api, and handle common error cases.
    In case of error, an error message is returned along with the api response.
    """
    response = requests.request(
        method,
        # Do a simple replace on the endpoint to avoid issues if double slash (//) is used incorrectly.
        urljoin(BASE_DOMAIN, endpoint.replace('//', '/')),
        headers=headers,
        json=json_data,
        timeout=TIMEOUT,
    )
    res_json = response.json()

    error_message = ""
    if response.status_code != 200 or res_json['status'] == '0':
        # Get the error code and message from the response, we will share them with the user.
        error_code = res_json['errorDetails']['errorCode']
        error_msg = _get_eis_error_message(env, error_code)
        if response.status_code == 400:
            # If this happens, there is an issue with the code above.
            error_message = env._("Something went wrong. Please contact Odoo's support.\n%s: %s", error_code, error_msg)
        elif response.status_code in (401, 404):
            # These will happen if the credentials are incorrect.
            error_message = env._("Unauthorized. Please verify your credentials.\n%s: %s", error_code, error_msg)
        else:
            # Finally, an error 500 will be raised if there is an issue on their end.
            error_message = env._("Something went wrong. Please try again later.\n%s: %s", error_code, error_msg)
    return res_json, error_message

# ------
# Errors
# ------


def _get_eis_error_message(env, error_code):
    """ Helps map an error code received by the EIS into a human-readable error message. """
    # todo these are the description of errors by EIS, to rework.
    return {
        'E01': env._('Accreditation ID (EIS Cert Number) that does not exist or is not registered for production environment'),
        'E02': env._('Invalid application ID does not exist or does not match its accreditation ID (EIS Cert Number)'),
        'E03': env._('Expired or invalid authentication token'),
        'E04': env._('The HMAC Signature in the Authorization field of the Request Header is incorrect.'),
        'E05': env._('The Datetime field in the Request Header is invalid.'),
        'E06': env._('EIS Key-pair of application has been expired.'),
        'E07': env._('Request from unregistered IP in the white-list on the Accreditation system.'),
        'E08': env._("If the accreditationId is under the approval process on the EIS-CERT system, or when the EIS-CERT approval or EIS-PTT is completed, the Sandbox API test can't carry out anymore."),
        'E11': env._('JSON Data in Request Body is invalid'),
        'E12': env._('Non-existent EIS Key-pair ID'),
        'E13': env._('Expired EIS Key-pair ID'),
        'E14': env._('Submit ID is already exists'),
        'E15': env._('Submit ID that does not exist or has expired after submission'),
        'E16': env._('Submit ID of non-existent processing result document'),
        'E17': env._('Callback URL that does not exist'),
        'E18': env._('LT sent wrong response information.'),
        'E19': env._('Too many sandbox requests.'),
        'E21': env._('The field "data" in the request body cannot be decrypted.'),
        'E22': env._('Invalid JSON data in the data field.'),
        'E23': env._('User ID does not exist or Password does not match'),
        'E24': env._('AuthKey has an invalid format.'),
        'E31': env._('Callback APIs response is wrong.'),
        'E99': env._('EIS Server Error'),
    }.get(error_code)
