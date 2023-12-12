# Part of Odoo. See LICENSE file for full copyright and licensing details.

# The currencies supported by Xendit, in ISO 4217 format.
SUPPORTED_CURRENCIES = [
    'IDR',
    'PHP',
]

# The codes of the payment methods to activate when Xendit is activated.
DEFAULT_PAYMENT_METHODS_CODES = [
    # Primary payment methods.
    'card',
    'dana',
    'ovo',
    'qris',

    # Brand payment methods.
    'visa',
    'mastercard',
]

# Mapping of transaction states to Xendit payment statuses.
PAYMENT_STATUS_MAPPING = {
    'draft': (),
    'pending': ('PENDING'),
    'done': ('SUCCEEDED', 'PAID'),
    'cancel': ('CANCELLED', 'EXPIRED'),
    'error': ('FAILED',)
}


# Mapping of payment code to channel code according to Xendit API
PAYMENT_METHODS_MAPPING = {
    'card': 'CREDIT_CARD',
    'bpi': 'DD_BPI',
    'maya': 'PAYMAYA',
}
