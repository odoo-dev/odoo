# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': 'Angola - Accounting',
    'website': 'https://www.odoo.com/documentation/latest/applications/finance/fiscal_localizations.html',
    'icon': '/account/static/description/l10n.png',
    'countries': ['ao'],
    'category': 'Accounting/Localizations/Account Charts',
    'description': """
Angolan Accounting localization
===============================
* Chart of accounts based on the Plano Geral de Contabilidade (Decreto n.º 82/01), with the VAT
  accounts introduced by the VAT Code regulation (Decreto Presidencial n.º 180/19).
* VAT taxes of the Código do IVA (Lei n.º 7/19, as republished by Lei n.º 14/23).
* Periodic VAT return (Declaração Periódica, Modelo 7).
* Fiscal positions: domestic, foreign (export / import / reverse charge), suppliers without VAT,
  customers withholding VAT (IVA cativo, art. 21.º CIVA).
    """,
    'depends': [
        'account',
    ],
    'auto_install': ['account'],
    'data': [
        'data/account_tax_report_data.xml',
    ],
    'demo': [
        'demo/demo_company.xml',
    ],
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
