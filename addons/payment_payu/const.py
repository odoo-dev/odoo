# Part of Odoo. See LICENSE file for full copyright and licensing details.

PROD_BASE_URL = 'info.payu.in'
TEST_BASE_URL = 'test.payu.in'
OAUTH_URL = 'https://ampa-odoo-ampa-internal-staging-29118269.dev.odoo.com/api/payu/1'  # replace with IAP URL
RETURN_URL = '/payment/payu/return'
WEBHOOK_URL = '/payment/payu/webhook'

# The currencies supported by PayU, in ISO 4217 format.

SUPPORTED_CURRENCIES = ['INR']

# Mapping of transaction states to Payu payment statuses.
PAYMENT_STATUS_MAPPING = {
    'pending': ['pending', 'pending auth'],
    'done': ['success'],
    'cancel': ['cancel'],
    'error': ['failure'],
}

# The codes of the payment methods to activate when PayU is activated.
DEFAULT_PAYMENT_METHOD_CODES = {
    # Primary payment methods.
    'netbanking',
    'card',
    'upi',
    'wallets_india',
    'emi_india',
    'paylater_india',
    # Brand payment methods.
    'visa',
    'mastercard',
    'maestro',
    'rupay',
    'amex',
    'diners',

}

PAYU_HASH_SEQUENCE = {
    'PAYMENT': 'key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5|udf6|udf7|udf8|udf9|udf10|salt',
    'PAYMENT_WEBHOOK': 'salt|status|udf10|udf9|udf8|udf7|udf6|udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key',
    'REFUND': 'key|command|var1|salt',
}

PAYMENT_METHODS_MAPPING = {
    'netbanking': ['netbanking'],
    'card': ['creditcard', 'debitcard'],
    'upi': ['upi'],
    'wallets_india': ['cashcard'],
    'emi_india': ['emi'],
    'paylater_india': ['bnpl'],
}
