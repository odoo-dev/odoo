# Part of Odoo. See LICENSE file for full copyright and licensing details.

# Endpoints of the API.
# See https://docs.adyen.com/api-explorer/#/CheckoutService/v70/overview for Checkout API
# See https://docs.adyen.com/api-explorer/#/Recurring/v68/overview for Recurring API
API_ENDPOINT_VERSIONS = {
    '/disable': 68,                 # Recurring API
    '/paymentMethods': 70,          # Checkout API
    '/payments': 70,                # Checkout API
    '/payments/details': 70,        # Checkout API
    '/payments/{}/cancels': 70,     # Checkout API
    '/payments/{}/captures': 70,    # Checkout API
    '/payments/{}/refunds': 70,     # Checkout API
}

# Adyen-specific mapping of currency codes in ISO 4217 format to the number of decimals.
# Only currencies for which Adyen does not follow the ISO 4217 norm are listed here.
# See https://docs.adyen.com/development-resources/currency-codes
CURRENCY_DECIMALS = {
    'CLP': 2,
    'CVE': 0,
    'IDR': 0,
    'ISK': 2,
}

# Mapping of payment method codes to Adyen codes.
PAYMENT_METHODS_MAPPING = {  # TODO update after we have the full PM list
    'mastercard': 'mc',
    'apple_pay': 'applepay',
    'unionpay': 'cup',
    'bancontact': 'bcmc',
    'sepa_debit': 'sepadirectdebit',
}

# Mapping of transaction states to Adyen result codes.
# See https://docs.adyen.com/checkout/payment-result-codes for the exhaustive list of result codes.
RESULT_CODES_MAPPING = {
    'pending': (
        'ChallengeShopper', 'IdentifyShopper', 'Pending', 'PresentToShopper', 'Received',
        'RedirectShopper'
    ),
    'done': ('Authorised',),
    'cancel': ('Cancelled',),
    'error': ('Error',),
    'refused': ('Refused',),
}
