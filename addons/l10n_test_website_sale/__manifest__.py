{
    'name': 'Test - Ecommerce & Accouting Localizations',
    'version': '1.0',
    'category': 'Hidden',
    'sequence': 9956,
    'summary': 'Shop addres Test for different countries',
    'description': """This module contains tests and tours related to shop address for different country localizations.""",
    'depends': [
        'l10n_br',
        'l10n_ec',
        'l10n_it_edi',
        'website_sale',
    ],
    'installable': True,
    'license': 'LGPL-3',
    'assets': {
        'web.assets_tests': [
            'l10n_test_website_sale/static/tests/tours/**/*',
        ],
    },
}
