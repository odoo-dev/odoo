# Part of Odoo. See LICENSE file for full copyright and licensing details.

# HDFC UPI QR Payment Provider Constants

# Base URLs for HDFC UPI API endpoints
HDFC_UPI_API_URLS = {
    'test': 'https://upitestv2.hdfcbank.com/upi',
    'production': 'https://upiv2.hdfcbank.com/upi',
}

# API endpoints mapping
API_ENDPOINTS = {
    'status': '/transactionStatusQuery',
    'refund': '/refundReqSvc',
}

# Supported currencies - UPI only supports INR
SUPPORTED_CURRENCIES = ['INR']

# Default payment method codes for HDFC UPI
DEFAULT_PAYMENT_METHOD_CODES = {'upi_qr'}

# UPI transaction limits (in INR)
TRANSACTION_LIMITS = {
    'min_amount': 1.0,
    'max_amount': 100000.0,  # ₹1,00,000 UPI QR limit
}

# QR code configuration
QR_CODE_CONFIG = {
    'expiry_minutes': 5,
    'width': 300,
    'height': 300,
    'version': '01',
    'mode': '15',
    'medium': '06',
}

# Payment status mapping for HDFC UPI responses
PAYMENT_STATUS_MAPPING = {
    'pending': ('PENDING',),
    'done': ('SUCCESS',),
    'cancel': ('FAILED', 'REJECTED', 'EXPIRED'),
    'error': ('ERROR', 'UNKNOWN'),
}

# UPI URL parameters template
UPI_URL_TEMPLATE = (
    "upi://pay?ver={version}&mode={mode}"
    "&tr={transaction_ref}&tn={transaction_note}"
    "&pn={payee_name}&pa={payee_vpa}"
    "&mc={merchant_category}&am={amount}"
    "&cu={currency}&qrMedium={medium}"
    "&QRexpire={expiry_time}"
)

# Timezone configuration
TIMEZONE_CONFIG = {
    'ist_timezone': 'Asia/Kolkata',
    'timezone_offset': '+05:30',
}

# Encryption configuration
ENCRYPTION_CONFIG = {
    'algorithm': 'AES',
    'mode': 'ECB',
    'key_encoding': 'md5',
    'output_format': 'hex_upper',
}

# Validation patterns
VALIDATION_PATTERNS = {
    'upi_vpa': r'^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$',
    'order_number': r'^PQ\d+\d{13}$',
    'refund_number': r'^RF\w+\d{10}$',
}

# API request configuration
API_CONFIG = {
    'timeout': 60,
    'verify_https': True,
    'content_type': 'application/json',
}

# Refund configuration
REFUND_CONFIG = {
    'time_limit_days': 180,  # 6 months refund window
    'min_refund_amount': 1.0,
    'max_refund_attempts': 3,
    'refund_reference_prefix': 'RF',
}

# Status codes for different operations
STATUS_CODES = {
    'payment': {
        'success': ['SUCCESS', 'COMPLETED'],
        'pending': ['PENDING', 'PROCESSING', 'INITIATED'],
        'failed': ['FAILED', 'REJECTED', 'EXPIRED', 'CANCELLED'],
        'error': ['ERROR', 'TIMEOUT', 'UNKNOWN'],
    },
    'refund': {
        'success': ['SUCCESS', 'COMPLETED', 'REFUNDED'],
        'pending': ['PENDING', 'PROCESSING', 'INITIATED'],
        'failed': ['FAILED', 'REJECTED', 'EXPIRED'],
        'error': ['ERROR', 'TIMEOUT', 'UNKNOWN'],
    }
}
