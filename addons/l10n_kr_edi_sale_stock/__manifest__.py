# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': "Republic of Korea - E-invoicing with Deliveries",
    'icon': '/account/static/description/l10n.png',
    'countries': ['kr'],
    'category': 'Accounting/Localizations/EDI',
    'summary': "Set the supply date of invoice lines from their deliveries",
    'description': """
Republic of Korea - E-invoicing with Deliveries
===============================================
Sets the supply date of each invoice line to the date of its latest delivery.
    """,
    'depends': ['l10n_kr_edi', 'sale_stock'],
    'auto_install': True,
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
