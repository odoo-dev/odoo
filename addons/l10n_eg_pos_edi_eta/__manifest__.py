{
    'name': "Egyptian E-Receipts Integration",
    'summary': """
            Egyptian Tax Authority E-Receipts Integration
        """,
    'description': """
       This module integrate with the ETA Portal to automatically sign and send your receipts to the tax Authority.
    """,
    'author': 'Odoo SA',
    'website': 'https://www.odoo.com/documentation/18.0/applications/finance/fiscal_localizations/egypt.html',
    'category': 'account',
    'version': '1.0',
    'license': 'LGPL-3',
    'depends': ['l10n_eg_edi_eta', 'point_of_sale'],
    'data': [
        'data/ir_cron.xml',
        'data/ir_actions_server.xml',
        'views/pos_config_views.xml',
        'views/pos_order_views.xml',
        'views/pos_payment_method_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'l10n_eg_pos_edi_eta/static/src/scss/pos.scss',
            'l10n_eg_pos_edi_eta/static/src/overrides/models/pos.js',
        ],
    },
    'auto_install': True,
}
