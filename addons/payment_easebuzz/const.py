# Part of Odoo. See LICENSE file for full copyright and licensing details.

# Currently only support INR. Kept in variable for later extend.
SUPPORTED_CURRENCIES = [
    'INR',
]

DEFAULT_PAYMENT_METHOD_CODES = {
    'netbanking',
    'card',
}

PAYMENT_METHOD_CODES_MAPPING = {
    'netbanking': ['NB'],
    'card': ['CC', 'DC'],
    'upi': ['UPI'],
    'wallets_india': ['MW'],
    'emi_india': ['EMI'],
    'paylater_india': ['PL'],
}

PAYMENT_METHODS_MAPPING = {
    'NB': 'netbanking',
    'CC': 'card',
    'DC': 'card',
    'UPI': 'upi',
    'MW': 'wallets_india',
    'EMI': 'emi_india',
    'PL': 'paylater_india',
}

PAYMENT_STATUS_MAPPING = {
    'done': ('success',),
    'error': ('failure',),
}

REFUND_STATUS_MAPPING = {
    'in progress': ('queued',),
    'authorized': ('accepted',),
    'done': ('refunded',),
    'error': ('failure',),
}

EASEBUZZ_HASH_SEQUENCE = {
    'PAYMENT': "key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5|udf6|udf7|udf8|udf9|udf10|salt",
    "REFUND": "key|merchant_refund_id|easebuzz_id|refund_amount|salt",
    "PAYMENT_WEBHOOK": "salt|status|udf10|udf9|udf8|udf7|udf6|udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key",
    "REFUND_WEBHOOK": "key|easepayid|salt",
}
