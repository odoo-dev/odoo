# Part of Odoo. See LICENSE file for full copyright and licensing details.

import hashlib
import re
from datetime import datetime, timedelta

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.backends import default_backend

from odoo.addons.payment_hdfc_upi_qr import const


def validate_upi_vpa(vpa):
    """Validate UPI Virtual Payment Address format.

    :param str vpa: The UPI VPA to validate
    :return: True if valid, False otherwise
    :rtype: bool
    """
    if not vpa:
        return False
    return bool(re.match(const.VALIDATION_PATTERNS['upi_vpa'], vpa))


def generate_transaction_reference(prefix='PQ'):
    """Generate a unique transaction reference for HDFC UPI.

    Format: {prefix}{timestamp_ms}

    :param str prefix: The prefix for the transaction reference
    :return: The generated transaction reference
    :rtype: str
    """
    timestamp_ms = int(datetime.now().timestamp() * 1000)
    return f"{prefix}{timestamp_ms}"


def generate_refund_reference(original_ref):
    """Generate a refund reference from original transaction reference.

    :param str original_ref: The original transaction reference
    :return: The generated refund reference
    :rtype: str
    """
    timestamp = int(datetime.now().timestamp())
    return f"RF{original_ref[-8:]}{timestamp}"


def generate_qr_expiry_time():
    """Generate QR code expiry time in IST.

    :return: The expiry time formatted for UPI QR
    :rtype: str
    """
    expiry_minutes = const.QR_CODE_CONFIG['expiry_minutes']
    expiry_time = datetime.now() + timedelta(minutes=expiry_minutes)
    return expiry_time.strftime('%Y%m%d%H%M')


def build_upi_url(transaction_ref, amount, payee_name, payee_vpa, merchant_category='0000'):
    """Build UPI payment URL for QR code generation.

    :param str transaction_ref: The transaction reference
    :param float amount: The transaction amount
    :param str payee_name: The merchant/payee name
    :param str payee_vpa: The merchant UPI VPA
    :param str merchant_category: The merchant category code
    :return: The UPI payment URL
    :rtype: str
    """
    config = const.QR_CODE_CONFIG

    return const.UPI_URL_TEMPLATE.format(
        version=config['version'],
        mode=config['mode'],
        transaction_ref=transaction_ref,
        transaction_note=f"Payment for {transaction_ref}",
        payee_name=payee_name,
        payee_vpa=payee_vpa,
        merchant_category=merchant_category,
        amount=amount,
        currency='INR',
        medium=config['medium'],
        expiry_time=generate_qr_expiry_time()
    )


def encrypt_payload(payload, encryption_key):
    """Encrypt payload using HDFC's encryption requirements.

    Implements AES encryption following HDFC UPI specifications:
    - Algorithm: AES
    - Mode: ECB
    - Key Generation: MD5 hash of provided key
    - Output Format: Uppercase hexadecimal

    :param str payload: The payload to encrypt
    :param str encryption_key: The encryption key
    :return: The encrypted payload
    :rtype: str
    """
    key_hash = hashlib.md5(encryption_key.encode('utf-8')).digest()

    cipher = Cipher(
        algorithms.AES(key_hash),
        modes.ECB(),
        backend=default_backend()
    )
    encryptor = cipher.encryptor()

    # Pad the payload to be multiple of 16 bytes using PKCS7 padding
    padder = padding.PKCS7(128).padder()  # 128 bits = 16 bytes
    padded_data = padder.update(payload.encode('utf-8'))
    padded_data += padder.finalize()

    encrypted_data = encryptor.update(padded_data) + encryptor.finalize()

    return encrypted_data.hex().upper()


def decrypt_payload(encrypted_payload, encryption_key):
    """Decrypt payload using HDFC's encryption requirements.

    Implements AES decryption following HDFC UPI specifications:
    - Algorithm: AES
    - Mode: ECB
    - Key Generation: MD5 hash of provided key
    - Input Format: Uppercase hexadecimal

    :param str encrypted_payload: The encrypted payload to decrypt
    :param str encryption_key: The encryption key
    :return: The decrypted payload
    :rtype: str
    """
    key_hash = hashlib.md5(encryption_key.encode('utf-8')).digest()

    cipher = Cipher(
        algorithms.AES(key_hash),
        modes.ECB(),
        backend=default_backend()
    )
    decryptor = cipher.decryptor()

    # Convert hex string back to bytes
    encrypted_data = bytes.fromhex(encrypted_payload)

    decrypted_padded = decryptor.update(encrypted_data) + decryptor.finalize()

    # Remove padding using PKCS7 unpadding
    unpadder = padding.PKCS7(128).unpadder()  # 128 bits = 16 bytes
    decrypted_data = unpadder.update(decrypted_padded)
    decrypted_data += unpadder.finalize()

    # Convert back to string
    return decrypted_data.decode('utf-8')


def validate_transaction_amount(amount, currency_code='INR'):
    """Validate transaction amount against UPI limits.

    :param float amount: The transaction amount
    :param str currency_code: The currency code
    :return: Tuple of (is_valid, error_message)
    :rtype: tuple
    """
    if currency_code != 'INR':
        return False, "UPI only supports INR currency"

    limits = const.TRANSACTION_LIMITS

    if amount < limits['min_amount']:
        return False, f"Amount must be at least ₹{limits['min_amount']}"

    if amount > limits['max_amount']:
        return False, f"Amount cannot exceed ₹{limits['max_amount']}"

    return True, None


def build_pipe_separated_request(field_values, field_names):
    """Build pipe-separated request string for HDFC UPI APIs.

    Builds the pipe-separated request format used by all HDFC UPI APIs
    (Status Enquiry and Refund) according to the field specifications.

    :param dict field_values: Dictionary of field names to values
    :param list field_names: List of field names in order
    :return: Pipe-separated request string
    :rtype: str
    """
    request_fields = []

    for field_name in field_names:
        value = field_values.get(field_name, 'NA')
        # Convert None, False, or empty string to 'NA'
        if not value or value in [None, False, '']:
            value = 'NA'
        request_fields.append(str(value))

    return '|'.join(request_fields)


def parse_pipe_separated_response(response_string, field_names):
    """Parse pipe-separated response from HDFC UPI APIs.

    All HDFC UPI APIs return responses in pipe-separated format with exactly
    21 fields as per the API specification.

    :param str response_string: Pipe-separated response string
    :param list field_names: List of field names to map values to
    :return: Dictionary of parsed field data
    :rtype: dict
    """
    if not response_string:
        return {}

    # Split by pipe separator
    field_values = response_string.split('|')

    # Create dictionary mapping field names to values
    parsed_data = {}
    for i, field_name in enumerate(field_names):
        if i < len(field_values):
            value = field_values[i].strip()
            # Convert 'NA', 'null', or empty strings to None for cleaner handling
            parsed_data[field_name] = value if value not in ['NA', 'null', ''] else None
        else:
            parsed_data[field_name] = None

    return parsed_data


def parse_additional_field_details(additional_field_value, expected_parts=5):
    """Parse additional field details that use exclamation mark separation.

    Many HDFC UPI additional fields use the format: "Value1!Value2!Value3!..."
    This utility function helps parse these structured additional fields.

    :param str additional_field_value: The additional field value to parse
    :param int expected_parts: Number of expected parts (default 5)
    :return: List of parsed parts
    :rtype: list
    """
    if not additional_field_value or additional_field_value in ['NA', 'null', '']:
        return ['NA'] * expected_parts

    parts = additional_field_value.split('!')

    # Ensure we have the expected number of parts
    while len(parts) < expected_parts:
        parts.append('NA')

    # Convert 'NA' to False for easier handling
    return [part if part != 'NA' else False for part in parts[:expected_parts]]


def build_encrypted_request_payload(request_data, merchant_id, encryption_key):
    """Build encrypted request payload for HDFC UPI APIs.

    Creates the JSON payload with encrypted request message as required
    by HDFC UPI API specifications.

    :param str request_data: Pipe-separated request data
    :param str merchant_id: PG Merchant ID
    :param str encryption_key: Encryption key
    :return: JSON payload for API request
    :rtype: dict
    """
    encrypted_message = encrypt_payload(request_data, encryption_key)

    return {
        'requestMsg': encrypted_message,
        'pgMerchantId': merchant_id
    }
