# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': 'China - E-Fapiao',
    'countries': ['cn'],
    'category': 'Accounting/Localizations/EDI',
    'icon': '/account/static/description/l10n.png',
    'summary': "E-Fapiao (电子发票) flow shared by the Chinese e-invoicing providers",
    'description': """
Issue fully-digital e-Fapiao (数电发票) from Odoo invoices and handle red letter
confirmation forms (红字确认单) for credit notes, on both the seller and the buyer side.

This module holds the flow, states and screens. It talks to the tax platform
through a provider module (e.g. China - E-Fapiao (Nuonuo)); install exactly one.
    """,
    'depends': ['l10n_cn', 'account', 'phone_validation'],
    'data': [
        'security/ir.access.csv',
        'data/ir_cron.xml',
        'data/l10n_cn_edi.tax.category.csv',
        'views/account_move_views.xml',
        'views/account_move_reversal_views.xml',
        'views/account_tax_views.xml',
        'views/l10n_cn_edi_document_views.xml',
        'views/product_template_views.xml',
        'views/res_config_settings_views.xml',
    ],
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
