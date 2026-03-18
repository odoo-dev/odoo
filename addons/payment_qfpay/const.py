# Part of Odoo. See LICENSE file for full copyright and licensing details.

SUPPORTED_CURRENCIES = [
    'HKD',
    'CNY',
    'USD',
    'AED',
    'EUR',
    'IDR',
    'JPY',
    'MMK',
    'MYR',
    'SGD',
    'THB',
    'CAD',
    'AUD'
]

DEFAULT_PAYMENT_METHOD_CODES = [
    'alipay',
    'alipay_hk',
    'wechat_pay',
    'unionpay',
    'fps',
    'payme',
    'card',
    'visa',
    'mastercard',
]

PAYMENT_STATUS_MAPPING = {
    'done': ['0000'],
    'pending': ['1143', '1145', '1298'],
    'cancel': ['1142', '1181', '1263', '1264'],
    'error': ['1108', '1201', '1202', '1204', '1205', '1294', '2005'],
}

# URLs for different environments.
API_URLS = {
    'enabled': '',
    'test': 'https://test-openapi-hk.qfapi.com/checkstand/#/?',
}
