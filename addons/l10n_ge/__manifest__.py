# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': 'Georgia - Accounting',
    'version': '1.0',
    'category': 'Accounting/Localizations/Account Charts',
    'summary': 'Georgian Chart of Accounts, Taxes, and Tax Reports',
    'description': """
Georgian Localization
=====================
* Chart of Accounts (IFRS-aligned, full Georgian CoA)
* Tax Groups
* Taxes:
    - VAT 18%, 0%, Exempt
    - Reverse Charge VAT (RCVAT)
    - Withholding Tax 0%, 4%, 5%, 10%, 15%
    - Export Tax 5%, 10%, 12%
* Fiscal Positions (Domestic / Non-Georgia)
* Tax Reports:
    - VAT Return (Annex VAT Declaration)
    - Withholding Tax Return
* Asset Models (PPE & Intangibles)
* Paper Format (A4)
    """,
    'author': 'Odoo S.A.',
    'depends': [
        'account',
    ],
    'demo': [
        'demo/demo_company.xml',
    ],
    'data': [
        'data/account_tax_report_vat_data.xml',
        'data/account_tax_report_wht_data.xml',
    ],
    'license': 'LGPL-3',
}
