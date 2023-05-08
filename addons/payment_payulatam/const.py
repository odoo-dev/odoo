# Part of Odoo. See LICENSE file for full copyright and licensing details.

# Supported currencies of PayuLatam, in ISO 4217 currency codes.
# https://developers.payulatam.com/latam/en/docs/getting-started/response-codes-and-variables.html#accepted-currencies.
# Last seen online: 22 September 2022.
SUPPORTED_CURRENCIES = [
    'ARS',
    'BRL',
    'CLP',
    'COP',
    'MXN',
    'PEN',
    'USD'
]

# Mapping of payment method codes to Ogone codes.
PAYMENT_METHODS_MAPPING = {
    'pagofacil': 'PAGOFACIL',
    'bank_reference': 'BANK_REFERENCED',
    'boleto_bancario': 'BOLETO_BANCARIO',
    'pix': 'PIX',
    'red_compra': 'TRANSBANK_DEBIT',
    'pse': 'PSE',
    'efecty': 'EFECTY',
    'su_red': 'OTHERS_CASH',
    'oxxo': 'OXXO',
    'klap': 'MULTICAJA',
    'pagoefectivo': 'PAGOEFECTIVO',
    'rapipago': 'RAPIPAGO',
    'spei': 'SPEI'
}
