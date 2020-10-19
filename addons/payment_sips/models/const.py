# Part of Odoo. See LICENSE file for full copyright and licensing details.

# ISO 4217 Data for currencies supported by sips
# NOTE: these are listed on the Atos Wordline SIPS POST documentation page
# at https://documentation.sips.worldline.com/en/WLSIPS.001-GD-Data-dictionary.html#Sips.001_DD_en-Value-currencyCode
# Yet with the simu environment, some of these currencies are *not* working
# I have no way to know if this is caused by the SIMU environment, or if it's
# the doc of SIPS that lists currencies that don't work, but since this list is
# restrictive, I'm gonna assume they are supported when using the right flow
# and payment methods, which may not work in SIMU...
# Since SIPS advises to use 'in production', well...
SUPPORTED_CURRENCIES = {
    'ARS': '032',
    'AUD': '036',
    'BHD': '048',
    'KHR': '116',
    'CAD': '124',
    'LKR': '144',
    'CNY': '156',
    'HRK': '191',
    'CZK': '203',
    'DKK': '208',
    'HKD': '344',
    'HUF': '348',
    'ISK': '352',
    'INR': '356',
    'ILS': '376',
    'JPY': '392',
    'KRW': '410',
    'KWD': '414',
    'MYR': '458',
    'MUR': '480',
    'MXN': '484',
    'NPR': '524',
    'NZD': '554',
    'NOK': '578',
    'QAR': '634',
    'RUB': '643',
    'SAR': '682',
    'SGD': '702',
    'ZAR': '710',
    'SEK': '752',
    'CHF': '756',
    'THB': '764',
    'AED': '784',
    'TND': '788',
    'GBP': '826',
    'USD': '840',
    'TWD': '901',
    'RSD': '941',
    'RON': '946',
    'TRY': '949',
    'XOF': '952',
    'XPF': '953',
    'BGN': '975',
    'EUR': '978',
    'UAH': '980',
    'PLN': '996',
    'BRL': '986',
}

# Mapping of transaction states to Sips response codes.
# See https://documentation.sips.worldline.com/en/WLSIPS.001-GD-Data-dictionary.html#Sips.001_DD_en-Value-currencyCode
RESPONSE_CODES_MAPPING = {
    'pending': ('60',),
    'done': ('00',),
    'cancel': (
        '03', '05', '12', '14', '17', '24', '25', '30', '34', '40', '51', '54', '63', '75', '90',
        '94', '97', '99'
    ),
}
