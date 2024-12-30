# Part of Odoo. See LICENSE file for full copyright and licensing details.

# ISO 4217 codes of currencies supported by Paymob
# Last seen on: 17 December 2024.
SUPPORTED_CURRENCIES = [
    'AED',
    'EGP',
    'OMR',
    'PKR',
    'SAR',
]

# For Paymob they only support 5 countries and for each country the matching currency is supported
COUNTRY_CURRENCY_MAPPING = {
    'AE': 'AED',
    'EG': 'EGP',
    'OM': 'OMR',
    'PK': 'PKR',
    'SA': 'SAR',
}

COUNTRY_API_MAPPING = {
    'AE': 'uae',
    'EG': 'accept',
    'OM': 'oman',
    'PK': 'pakistan',
    'SA': 'ksa',
}

# The codes of the payment methods to activate when Paymob is activated.
DEFAULT_PAYMENT_METHOD_CODES = {
    # Primary payment methods.
    'card',
}

# Paymob deals with integer values for the amount
# Error message from Paymob:
# The amount parameter should be provided as an integer representing the decimal units
# of the currency. Example: Pass 100 for EGP 1 / AED 1 / PKR 1 / SAR 1, Pass 1000 for OMR 1."]}
CURRENCY_DECIMAL_MAPPING = {
    'AED': 100,
    'EGP': 100,
    'OMR': 1000,
    'PKR': 100,
    'SAR': 100,
}

PAYMENT_STATUS_MAPPING = {
    'pending': (
        'PENDING',
        'CREATED',
        'APPROVED',  # The buyer approved a checkout order.
    ),
    'done': (
        'COMPLETED',
        'CAPTURED',
    ),
    'cancel': (
        'DECLINED',
        'DENIED',
        'VOIDED',
    ),
    'error': ('FAILED',),
}