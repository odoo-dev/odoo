# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': 'Ghana - Accounting',
    'website': 'https://www.odoo.com/documentation/latest/applications/finance/fiscal_localizations.html',
    'icon': '/account/static/description/l10n.png',
    'countries': ['gh'],
    'category': 'Accounting/Localizations/Account Charts',
    'description': """
Ghana - Accounting
==================

This provides a base chart of accounts (English, IFRS-oriented, 6 digits), taxes, tax reports,
fiscal positions and the regions of Ghana for use in Odoo.

Contents
--------
    - Chart of accounts: non-current assets and accumulated depreciation, IFRS 16 lease accounts,
      tax control accounts (VAT, NHIL, GETFund Levy, withholding tax, corporate income tax, PAYE, SSNIT),
      inventory and stock interim accounts, loans, equity (Stated Capital, Income Surplus),
      income, cost of sales, operating expenses, depreciation, finance costs and income tax expense.
    - Taxes: VAT 15%, NHIL 2.5% and GETFund Levy 2.5% charged on the same taxable value (20% group
      taxes, with each levy on its own line and tax group), zero-rated, export, free zone and exempt
      supplies, imports of goods, reverse charge on imported services, and withholding taxes.
    - Reports: VAT Return (Taxable Value / VAT / NHIL / GETFund Levy, with credit carry-over),
      Withholding Tax Report, Balance Sheet and Profit and Loss.
    - Fiscal positions: Domestic (Ghana), International, Free Zone Enterprise, Imported Services.
    - The 16 regions of Ghana (ISO 3166-2:GH).

Legal basis
-----------
    - Value Added Tax Act, 2025 (Act 1151), effective 1 January 2026: VAT at 15% (s.3), tax on imports
      of goods and services (s.34, s.61), exempt supplies (s.35, First Schedule), zero-rated supplies
      (s.36, Second Schedule), deductible input tax (s.49-52).
    - GRA VAT page, GRA notice to VAT registered taxpayers and GRA VAT Administrative Guidelines for
      Act 1151 (GRA/AG/25/002): NHIL 2.5% and GETFund Levy 2.5% on the same taxable value (20% in total),
      NHIL and GETFund recoverable as input tax, COVID-19 Health Recovery Levy and VAT Flat Rate Scheme
      abolished.
    - GRA Withholding Tax page and GRA Practice Note DT/2016/001 (Income Tax Act, 2015, Act 896):
      resident and non-resident withholding rates and the GH¢2,000 per annum threshold.
    - ISO 3166-2:GH for the regions.

Full list of sources, with URLs: see REFERENCES.md and README.md in the module.

Not included
------------
Payroll (PAYE, SSNIT calculation), E-VAT e-invoicing, Communication Service Tax,
Tourism Levy, Growth and Sustainability Levy calculation and VAT withholding by appointed agents.
    """,
    'depends': [
        'account',
    ],
    'auto_install': ['account'],
    'data': [
        'data/res_country_state_data.xml',
        'data/account_vat_report_data.xml',
        'data/account_wht_report_data.xml',
        'data/account_balance_sheet_data.xml',
        'data/account_profit_loss_data.xml',
    ],
    'demo': [
        'demo/demo_company.xml',
    ],
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
