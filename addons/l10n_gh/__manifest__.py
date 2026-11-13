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

This provides a base chart of accounts (English, IFRS-oriented, 6 digits), taxes, tax reports
and fiscal positions for use in Odoo.

Contents
--------
    - Chart of accounts: non-current assets and accumulated depreciation, IFRS 16 lease accounts,
      tax control accounts (VAT, NHIL, GETFund Levy, withholding tax, corporate income tax, PAYE, SSNIT),
      inventory and stock interim accounts, loans, equity (Stated Capital, Income Surplus),
      income, cost of sales, operating expenses, depreciation, finance costs and income tax expense.
    - Taxes: 20% standard group (VAT 15% + NHIL 2.5% + GETFund Levy 2.5% charged on the same taxable
      value, each levy on its own line and tax group) for sales, purchases, imports of goods (20% IMP)
      and reverse charge on imported services (20% RC); 0% EX (export / foreign goods), 0% E (exempt),
      0% purchases; withholding taxes applied on payment (3% goods, 5% works, 7.5% services, 20%
      non-resident, 7% VAT withholding by appointed agents) for sales and purchases.
    - Reports: VAT Return (Taxable Value / VAT / NHIL / GETFund Levy, with credit carry-over)
      and Withholding Tax Report.
    - Fiscal positions: Domestic, Foreign, VAT Withholding Agent.
    - Fixed assets: default depreciation models, depreciation and expense accounts.

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

Not included
------------
Payroll (PAYE, SSNIT calculation), E-VAT e-invoicing, Communication Service Tax,
Tourism Levy, Growth and Sustainability Levy calculation and VAT withholding by appointed agents.
    """,
    'depends': [
        'account',
        'l10n_account_withholding_tax',
    ],
    'auto_install': ['account'],
    'data': [
        'data/account_vat_report_data.xml',
        'data/account_wht_report_data.xml',
    ],
    'demo': [
        'demo/demo_company.xml',
    ],
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
