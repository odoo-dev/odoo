# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64
import hashlib
import json
import re
from datetime import datetime, timedelta, timezone

from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad

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
    
    Implements AES encryption following HDFC UPI specifications.
    
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
    
    try:
        # Create encryption key from the provided key using MD5 hash
        key_hash = hashlib.md5(encryption_key.encode('utf-8')).digest()
        
        # Initialize AES cipher with ECB mode (as per HDFC specifications)
        cipher = AES.new(key_hash, AES.MODE_ECB)
        
        # Pad the payload to be multiple of 16 bytes
        padded_payload = pad(payload_str.encode('utf-8'), AES.block_size)
        
        # Encrypt the payload
        encrypted_data = cipher.encrypt(padded_payload)
        
        # Return as hex string (uppercase as per HDFC requirements)
        return encrypted_data.hex().upper()
        
    except (ImportError, NameError):
        # If pycryptodome is not available, use simple base64 encoding as fallback
        encoded = base64.b64encode(payload_str.encode('utf-8')).decode('utf-8')
        return f"FALLBACK_ENC_{encoded}"
        
    except Exception as e:
        # Return error indicator for failed encryption
        return f"ENC_ERROR_{str(e)[:50]}"


def decrypt_payload(encrypted_payload, encryption_key):
    """Decrypt payload using HDFC's encryption requirements.
    
    Implements AES decryption following HDFC UPI specifications.
    
    :param str encrypted_payload: The encrypted payload to decrypt
    :param str encryption_key: The encryption key
    :return: The decrypted payload
    :rtype: dict/str
    """
    # Handle fallback encoding
    if encrypted_payload.startswith('FALLBACK_ENC_'):
        encoded_data = encrypted_payload[13:]  # Remove prefix
        try:
            decoded = base64.b64decode(encoded_data.encode('utf-8')).decode('utf-8')
            try:
                return json.loads(decoded)
            except json.JSONDecodeError:
                return decoded
        except Exception as e:
            return {'error': f'Fallback decoding failed: {str(e)}'}
    
    # Handle encryption errors
    if encrypted_payload.startswith('ENC_ERROR_'):
        return {'error': 'Encryption failed during payload creation'}
    
    try:
        # Create decryption key from the provided key using MD5 hash
        key_hash = hashlib.md5(encryption_key.encode('utf-8')).digest()
        
        # Initialize AES cipher with ECB mode
        cipher = AES.new(key_hash, AES.MODE_ECB)
        
        # Convert hex string back to bytes
        encrypted_data = bytes.fromhex(encrypted_payload)
        
        # Decrypt the payload
        decrypted_padded = cipher.decrypt(encrypted_data)
        
        # Remove padding
        decrypted_data = unpad(decrypted_padded, AES.block_size)
        
        # Convert back to string
        payload_str = decrypted_data.decode('utf-8')
        
        # Try to parse as JSON, return as string if it fails
        try:
            return json.loads(payload_str)
        except json.JSONDecodeError:
            return payload_str
            
    except (ImportError, NameError):
        return {'error': 'Crypto library not available for decryption'}
    except Exception as e:
        return {'error': f'Decryption failed: {str(e)}'}


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
