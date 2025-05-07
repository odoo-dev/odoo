# Part of Odoo. See LICENSE file for full copyright and licensing details.

# Mapping of transaction states to Nuvei payment statuses.
PAYMENT_STATUS_MAPPING = {
    'done': ('CAPTURED', 'PROCESSING'),
    'pending': ('NOT+CAPTURED', 'NOT+PROCESSED'),
}

# The codes of the payment methods to activate when Buckaroo is activated.
DEFAULT_PAYMENT_METHOD_CODES = {
    # Primary payment methods.
    'card',
    'mada',
}

SUPPORTED_CURRENCIES = [
    'ZAR',
]