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

API_URL_OBJ = {
    "INVOICE": "https://api.xendit.co/v2/invoices",
    "TOKEN": "https://api.xendit.co/credit_card_tokens/{token_id}",
    "CHARGE": "https://api.xendit.co/credit_card_charges",
}

# Mapping of transaction states to Xendit payment statuses.
PAYMENT_STATUS_MAPPING = {
    'draft': (),
    'pending': ('PENDING',),
    'authorized': ('AUTHORIZED',),
    'done': ('SUCCEEDED', 'CAPTURED', 'PAID', 'REQUESTED', 'SETTLED'),
    'cancel': ('CANCELLED', 'EXPIRED'),
    'error': ('FAILED',)
}
