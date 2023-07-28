# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': 'Brazilian - Accounting',
    'website': 'https://www.odoo.com/documentation/saas-16.3/applications/finance/fiscal_localizations.html',
    'icon': '/account/static/description/l10n.png',
    'countries': ['br'],
    'category': 'Accounting/Localizations/Account Charts',
    'description': """
Base module for the Brazilian localization
==========================================

This module consists of:

 - Generic Brazilian chart of accounts
 - Brazilian taxes such as:

        - IPI
        - ICMS
        - PIS
        - COFINS
        - ISS
        - IR
        - IRPJ
        - CSLL

The field tax_discount has also been added in the account.tax.template and
account.tax objects to allow the proper computation of some Brazilian VATs
such as ICMS. The chart of account creation wizard has been extended to
propagate those new data properly.

It's important to note however that this module lack many implementations to
use Odoo properly in Brazil. Those implementations (such as the electronic
fiscal Invoicing which is already operational) are brought by more than 15
additional modules of the Brazilian Launchpad localization project
https://launchpad.net/openerp.pt-br-localiz and their dependencies in the
extra addons branch. Those modules aim at not breaking with the remarkable
Odoo modularity, this is why they are numerous but small. One of the
reasons for maintaining those modules apart is that Brazilian Localization
leaders need commit rights agility to complete the localization as companies
fund the remaining legal requirements (such as soon fiscal ledgers,
accounting SPED, fiscal SPED and PAF ECF that are still missing as September
2011). Those modules are also strictly licensed under AGPL V3 and today don't
come with any additional paid permission for online use of 'private modules'.
""",
    'author': 'Akretion, Odoo Brasil',
    'depends': [
        'account',
        'base_vat',
    ],
    'data': [
        'data/account_tax_report_data.xml',
        'views/account_view.xml',
        'views/account_fiscal_position_views.xml',
        'views/res_company_views.xml',
        'views/res_partner_views.xml',
    ],
    'demo': [
        'demo/demo_company.xml',
    ],
    'license': 'LGPL-3',
}
