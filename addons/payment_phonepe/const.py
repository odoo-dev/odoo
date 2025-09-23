# Part of Odoo. See LICENSE file for full copyright and licensing details.

# Currently only support INR. Kept in variable for later extend.
SUPPORTED_CURRENCIES = [
    'INR'
]

DEFAULT_PAYMENT_METHOD_CODES = {
    'upi',
    'netbanking',
    'card',
}

PAYMENT_METHOD_CODES_MAPPING = {
    'upi': ['UPI_QR', 'UPI_COLLECT', 'UPI_INTENT'],
    'card': ['CARD'],
    'netbanking': ['NET_BANKING']
}

PAYMENT_METHODS_MAPPING = {
    'UPI_QR': 'upi',
    'UPI_COLLECT': 'upi',
    'UPI_INTENT': 'upi',
    'CARD': 'card',
    'NET_BANKING': 'netbanking',
}

PAYMENT_STATUS_MAPPING = {
    'done': ('COMPLETED',),
    'error': ('FAILED',),
}

# Events that are handled by the webhook.
HANDLED_WEBHOOK_EVENTS = [
    'checkout.order.completed',
    'checkout.order.failed',
    'pg.refund.failed',
    'pg.refund.completed',
]
