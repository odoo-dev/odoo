# Part of Odoo. See LICENSE file for full copyright and licensing details.

# Mapping of payment method codes to Authorize codes.
PAYMENT_METHODS_MAPPING = {
    'amex': 'AmericanExpress',
    'diners': 'DinersClub',
    'discover': 'Discover',
    'jcb': 'JCB',
    'mastercard': 'Mastercard',
    'visa': 'Visa',
    'card': 'creditCard'
}

# Mapping of payment status on Authorize side to transaction statuses.
# See https://developer.authorize.net/api/reference/index.html#transaction-reporting-get-transaction-details.
TRANSACTION_STATUS_MAPPING = {
    'authorized': ['authorizedPendingCapture', 'capturedPendingSettlement'],
    'captured': ['settledSuccessfully'],
    'voided': ['voided'],
    'refunded': ['refundPendingSettlement', 'refundSettledSuccessfully'],
}
