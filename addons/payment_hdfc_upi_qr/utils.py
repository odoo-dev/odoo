# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64
import hashlib
import json
import re
from datetime import datetime, timedelta

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.backends import default_backend

from odoo.addons.payment_hdfc_upi_qr import const


def format_upi_amount(amount):
    """Format amount for UPI transactions.

    UPI amounts must be formatted as strings with exactly 2 decimal places.

    :param float amount: The transaction amount
    :return: The formatted amount string
    :rtype: str
    """
    if not amount:
        return "0.00"
    return f"{float(amount):.2f}"


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


def get_current_timestamp():
    """Get current timestamp for transaction references.

    :return: Current timestamp as string
    :rtype: str
    """
    return str(int(datetime.now().timestamp() * 1000))


def calculate_qr_expiry(expiry_minutes):
    """Calculate QR code expiry time.

    :param int expiry_minutes: Minutes until expiry
    :return: Expiry datetime
    :rtype: datetime
    """
    return datetime.now() + timedelta(minutes=expiry_minutes)


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
        payee_name=payee_name.replace(' ', '%20'),
        payee_vpa=payee_vpa,
        merchant_category=merchant_category,
        amount=format_upi_amount(amount),
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

    :param dict/str payload: The payload to encrypt
    :param str encryption_key: The encryption key
    :return: The encrypted payload
    :rtype: str
    """
    # Convert payload to string if it's a dict
    if isinstance(payload, dict):
        payload_str = json.dumps(payload, separators=(',', ':'))
    else:
        payload_str = str(payload)

    if not encryption_key:
        # Return error indicator for missing key
        return "ENC_ERROR_NO_KEY"

    try:
        # Create encryption key from the provided key using MD5 hash
        key_hash = hashlib.md5(encryption_key.encode('utf-8')).digest()

        # Initialize AES cipher with ECB mode using cryptography library
        cipher = Cipher(
            algorithms.AES(key_hash),
            modes.ECB(),
            backend=default_backend()
        )
        encryptor = cipher.encryptor()

        # Pad the payload to be multiple of 16 bytes using PKCS7 padding
        padder = padding.PKCS7(128).padder()  # 128 bits = 16 bytes
        padded_data = padder.update(payload_str.encode('utf-8'))
        padded_data += padder.finalize()

        # Encrypt the payload
        encrypted_data = encryptor.update(padded_data) + encryptor.finalize()

        # Return as hex string (uppercase as per HDFC requirements)
        return encrypted_data.hex().upper()

    except ImportError:
        # If cryptography is not available, use simple base64 encoding as fallback
        encoded = base64.b64encode(payload_str.encode('utf-8')).decode('utf-8')
        return f"FALLBACK_ENC_{encoded}"

    except (ValueError, TypeError) as e:
        # Return error indicator for failed encryption
        error_msg = f"{e!s}"[:50]
        return f"ENC_ERROR_{error_msg}"


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
    :rtype: dict/str
    """
    if not encrypted_payload or not encryption_key:
        return {'error': 'Missing encrypted payload or encryption key'}

    # Handle fallback encoding
    if encrypted_payload.startswith('FALLBACK_ENC_'):
        encoded_data = encrypted_payload[13:]  # Remove prefix
        try:
            decoded = base64.b64decode(encoded_data.encode('utf-8')).decode('utf-8')
            try:
                return json.loads(decoded)
            except json.JSONDecodeError:
                return decoded
        except (ValueError, TypeError) as e:
            return {'error': f'Fallback decoding failed: {e!s}'}

    # Handle encryption errors
    if encrypted_payload.startswith('ENC_ERROR_'):
        error_msg = encrypted_payload[10:]  # Remove prefix
        return {'error': f'Encryption failed: {error_msg}'}

    try:
        # Create decryption key from the provided key using MD5 hash
        key_hash = hashlib.md5(encryption_key.encode('utf-8')).digest()

        # Initialize AES cipher with ECB mode using cryptography library
        cipher = Cipher(
            algorithms.AES(key_hash),
            modes.ECB(),
            backend=default_backend()
        )
        decryptor = cipher.decryptor()

        # Convert hex string back to bytes (handle both upper and lower case)
        try:
            encrypted_data = bytes.fromhex(encrypted_payload)
        except ValueError as e:
            return {'error': f'Invalid hex format: {e!s}'}

        # Decrypt the payload
        decrypted_padded = decryptor.update(encrypted_data) + decryptor.finalize()

        # Remove padding using PKCS7 unpadding
        unpadder = padding.PKCS7(128).unpadder()  # 128 bits = 16 bytes
        decrypted_data = unpadder.update(decrypted_padded)
        decrypted_data += unpadder.finalize()

        # Convert back to string
        payload_str = decrypted_data.decode('utf-8')

        # Try to parse as JSON, return as string if it fails
        try:
            return json.loads(payload_str)
        except json.JSONDecodeError:
            return payload_str

    except ImportError:
        return {'error': 'Cryptography library not available for decryption'}
    except (ValueError, TypeError) as e:
        return {'error': f'Decryption failed: {e!s}'}


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
        return False, f"Amount cannot exceed ₹{limits['max_amount']:,.2f}"

    return True, None


def sanitize_merchant_name(name):
    """Sanitize merchant name for UPI compliance.

    UPI merchant names should not contain special characters that could
    interfere with QR code generation or payment processing.

    :param str name: The original merchant name
    :return: The sanitized merchant name
    :rtype: str
    """
    if not name:
        return "Merchant"

    # Remove special characters except spaces, hyphens, and dots
    sanitized = re.sub(r'[^\w\s\-\.]', '', name)

    # Replace multiple spaces with single space
    sanitized = re.sub(r'\s+', ' ', sanitized)

    # Trim and limit length
    sanitized = sanitized.strip()[:50]

    return sanitized or "Merchant"


def parse_hdfc_response(response_content):
    """Parse HDFC UPI API response and extract relevant information.

    :param dict response_content: The API response content
    :return: Parsed response data
    :rtype: dict
    """
    if not isinstance(response_content, dict):
        return {
            'success': False,
            'status': 'ERROR',
            'message': 'Invalid response format'
        }

    # Extract common fields from HDFC response
    return {
        'success': response_content.get('success', False),
        'status': response_content.get('status', 'UNKNOWN'),
        'message': response_content.get('message', ''),
        'transaction_id': response_content.get('transactionId'),
        'upi_transaction_id': response_content.get('upiTransactionId'),
        'amount': response_content.get('amount'),
        'reference': response_content.get('reference'),
        'timestamp': response_content.get('timestamp'),
    }


def map_hdfc_status_to_odoo_state(hdfc_status):
    """Map HDFC UPI status to Odoo transaction state.

    :param str hdfc_status: The HDFC UPI status
    :return: The corresponding Odoo transaction state
    :rtype: str
    """
    if not hdfc_status:
        return 'error'

    hdfc_status = hdfc_status.upper()

    for odoo_state, hdfc_statuses in const.PAYMENT_STATUS_MAPPING.items():
        if hdfc_status in hdfc_statuses:
            return odoo_state

    return 'error'  # Default to error for unknown statuses


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
    """Parse pipe-separated response string from HDFC UPI APIs.

    Parses the pipe-separated response format used by all HDFC UPI APIs
    according to the 21-field response specification.

    :param str response_string: Pipe-separated response string
    :param list field_names: List of field names for mapping
    :return: Dictionary of parsed response data
    :rtype: dict
    """
    if not response_string:
        return {}

    response_fields = response_string.split('|')
    parsed_data = {}

    for i, field_name in enumerate(field_names):
        if i < len(response_fields):
            value = response_fields[i].strip()
            # Convert 'NA', 'null', empty string to False
            if value in ['NA', 'null', '', 'None']:
                parsed_data[field_name] = False
            else:
                parsed_data[field_name] = value
        else:
            parsed_data[field_name] = False

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


def format_hdfc_timestamp(datetime_obj=None):
    """Format datetime for HDFC UPI API requirements.

    HDFC UPI APIs expect timestamps in the format: YYYY:MM:DD HH:MM:SS

    :param datetime datetime_obj: DateTime object to format (default: now)
    :return: Formatted timestamp string
    :rtype: str
    """
    if datetime_obj is None:
        datetime_obj = datetime.now()

    return datetime_obj.strftime('%Y:%m:%d %H:%M:%S')


def validate_hdfc_field_length(field_name, field_value, max_length):
    """Validate field length according to HDFC UPI specifications.

    :param str field_name: Name of the field being validated
    :param str field_value: Value to validate
    :param int max_length: Maximum allowed length
    :return: Tuple of (is_valid, error_message)
    :rtype: tuple
    """
    if not field_value:
        return True, None

    if len(str(field_value)) > max_length:
        return False, f"{field_name} exceeds maximum length of {max_length} characters"

    return True, None


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
