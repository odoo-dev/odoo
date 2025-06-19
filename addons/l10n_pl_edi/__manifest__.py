{
    'name': 'Polish E-Invoicing FA(3)',
    'version': '1.0',
    'category': 'Accounting/Localizations',
    'summary': 'Support for FA(3) electronic invoices in Poland via KSeF',
    'description': """Export FA(3) compliant XML invoices and prepare for integration with KSeF.""",
    'data': [
        'views/account_move_views.xml',
        'security/ir.model.access.csv',
        'wizard/l10n_pl_edi_cert_upload_wizard_views.xml',
        'views/res_config_settings_views.xml',
        'data/ir_cron_data.xml',
        'data/fa3_template.xml',
        'demo/account_invoice_demo.xml',
        'views/l10n_pl_edi_view.xml'
    ],
    'depends': [
        'l10n_pl',
    ],
    'installable': True,
    'auto_install': True,
    'license': 'LGPL-3',
}
