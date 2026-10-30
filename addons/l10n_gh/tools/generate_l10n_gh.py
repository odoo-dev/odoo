#!/usr/bin/env python3
# Part of Odoo. See LICENSE file for full copyright and licensing details.
"""Generator for the data files of l10n_gh (Odoo 20.0).

Run from anywhere:  python3 l10n_gh/tools/generate_l10n_gh.py

It (re)writes:
  data/template/account.account-gh.csv
  data/template/account.tax.group-gh.csv
  data/template/account.tax-gh.csv
  data/template/account.fiscal.position-gh.csv
  data/res_country_state_data.xml
  data/account_vat_report_data.xml
  data/account_wht_report_data.xml
  data/account_balance_sheet_data.xml
  data/account_profit_loss_data.xml
  README.md (Research Documents section is generated from tools/sources.py)
  REFERENCES.md

Source keys used in the "# Source:" comments below are defined in tools/sources.py
and expanded to full titles/URLs in REFERENCES.md.

Legal facts used (all verified on 2026-10-28, see REFERENCES.md):
  * Value Added Tax Act, 2025 (Act 1151), effective 1 January 2026.
  * VAT 15% (Act 1151 s.3); NHIL 2.5% and GETFund Levy 2.5% on the same taxable
    value, no cascading; total 20% (GRA VAT page, GRA notice, Guidelines s.5-6, 15.3).
  * COVID-19 Health Recovery Levy and the VAT Flat Rate Scheme are abolished.
  * Withholding rates: GRA withholding tax page (resident and non-resident tables).
"""
import csv
import os
import sys
from xml.sax.saxutils import escape

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sources  # noqa: E402

MOD = os.path.dirname(HERE)
DATA = os.path.join(MOD, 'data')
TPL = os.path.join(DATA, 'template')

INV = 'account.account_tag_investing'
FIN = 'account.account_tag_financing'

# --------------------------------------------------------------------------------------
# 1. CHART OF ACCOUNTS
# Source: no legal source - IFRS-oriented presentation (IAS 1 / IFRS 16 lease accounts).
# Control accounts exist for the taxes that the sources above say are levied:
#   VAT, NHIL, GETFund (vat_page, vat_notice, guide1151), withholding tax (wht_page),
#   corporate income tax, PAYE and SSNIT (payroll posting itself is out of scope).
# Odoo selection values for account_type: src_account_account.
# --------------------------------------------------------------------------------------
# (code, name, account_type, reconcile, tags)
ACCOUNTS = [
    # ---- Non-current assets
    ('111100', 'Land', 'asset_fixed', False, INV),
    ('111200', 'Buildings', 'asset_fixed', False, INV),
    ('111300', 'Plant and Machinery', 'asset_fixed', False, INV),
    ('111400', 'Motor Vehicles', 'asset_fixed', False, INV),
    ('111500', 'Furniture and Fittings', 'asset_fixed', False, INV),
    ('111600', 'Computer and IT Equipment', 'asset_fixed', False, INV),
    ('111700', 'Capital Work in Progress', 'asset_fixed', False, INV),
    ('111800', 'Right-of-Use Assets (IFRS 16)', 'asset_fixed', False, INV),
    ('112200', 'Accumulated Depreciation - Buildings', 'asset_fixed', False, INV),
    ('112300', 'Accumulated Depreciation - Plant and Machinery', 'asset_fixed', False, INV),
    ('112400', 'Accumulated Depreciation - Motor Vehicles', 'asset_fixed', False, INV),
    ('112500', 'Accumulated Depreciation - Furniture and Fittings', 'asset_fixed', False, INV),
    ('112600', 'Accumulated Depreciation - Computer and IT Equipment', 'asset_fixed', False, INV),
    ('112800', 'Accumulated Depreciation - Right-of-Use Assets', 'asset_fixed', False, INV),
    ('113100', 'Intangible Assets - Software', 'asset_non_current', False, INV),
    ('113200', 'Intangible Assets - Licences and Other', 'asset_non_current', False, INV),
    ('113900', 'Accumulated Amortisation - Intangible Assets', 'asset_non_current', False, INV),
    ('114100', 'Investment Property', 'asset_non_current', False, INV),
    ('114200', 'Investments in Subsidiaries and Associates', 'asset_non_current', False, INV),
    ('114300', 'Other Non-current Financial Assets', 'asset_non_current', False, INV),
    ('115100', 'Deferred Tax Asset', 'asset_non_current', False, ''),
    # ---- Current assets
    ('121000', 'Inventory', 'asset_current', False, ''),
    ('121100', 'Stock Interim (Received)', 'asset_current', False, ''),
    ('121200', 'Stock Interim (Delivered)', 'asset_current', False, ''),
    ('122100', 'Trade Receivables', 'asset_receivable', True, ''),
    ('122200', 'Point of Sale Receivables', 'asset_receivable', True, ''),
    ('122300', 'Staff Receivables', 'asset_current', True, ''),
    ('122400', 'Other Receivables', 'asset_current', True, ''),
    ('122500', 'Allowance for Doubtful Debts', 'asset_current', False, ''),
    ('123100', 'Prepayments', 'asset_prepayments', False, ''),
    ('123200', 'Accrued Income', 'asset_current', False, ''),
    ('124100', 'VAT Input (Recoverable)', 'asset_current', False, ''),
    ('124200', 'NHIL Input (Recoverable)', 'asset_current', False, ''),
    ('124300', 'GETFund Levy Input (Recoverable)', 'asset_current', False, ''),
    ('124400', 'VAT, NHIL and GETFund Refund Receivable', 'asset_current', False, ''),
    ('124500', 'Withholding Tax Receivable (Tax Withheld by Customers)', 'asset_current', False, ''),
    ('124600', 'Corporate Income Tax Receivable / Provisional Tax Paid', 'asset_current', False, ''),
    # ---- Current liabilities
    ('211100', 'Trade Payables', 'liability_payable', True, ''),
    ('211200', 'Accrued Expenses', 'liability_current', False, ''),
    ('211300', 'Salaries and Wages Payable', 'liability_current', False, ''),
    ('211400', 'Deferred Revenue and Customer Advances', 'liability_current', False, ''),
    ('211500', 'Other Payables', 'liability_current', False, ''),
    ('212100', 'Bank Overdraft', 'liability_current', False, FIN),
    ('212200', 'Short-term Loans', 'liability_current', False, FIN),
    ('212300', 'Current Portion of Long-term Loans', 'liability_current', False, FIN),
    ('212400', 'Lease Liabilities - Current (IFRS 16)', 'liability_current', False, FIN),
    ('221100', 'VAT Output Payable', 'liability_current', False, ''),
    ('221200', 'NHIL Payable', 'liability_current', False, ''),
    ('221300', 'GETFund Levy Payable', 'liability_current', False, ''),
    ('221500', 'Withholding Tax Payable - Resident', 'liability_current', False, ''),
    ('221600', 'Withholding Tax Payable - Non-resident', 'liability_current', False, ''),
    ('222100', 'Corporate Income Tax Payable', 'liability_current', False, ''),
    ('222200', 'PAYE Payable', 'liability_current', False, ''),
    ('222300', 'SSNIT Contributions Payable', 'liability_current', False, ''),
    ('222400', 'Tier 2 and Tier 3 Pension Contributions Payable', 'liability_current', False, ''),
    # ---- Non-current liabilities
    ('231100', 'Long-term Loans', 'liability_non_current', False, FIN),
    ('232100', 'Lease Liabilities - Non-current (IFRS 16)', 'liability_non_current', False, FIN),
    ('233100', 'Deferred Tax Liability', 'liability_non_current', False, ''),
    ('234100', 'Provisions', 'liability_non_current', False, ''),
    ('234200', 'Employee Benefit Obligations', 'liability_non_current', False, ''),
    # ---- Equity
    ('311100', 'Stated Capital', 'equity', False, FIN),
    ('312100', 'Revaluation Reserve', 'equity', False, ''),
    ('312200', 'Statutory Reserve', 'equity', False, ''),
    ('312300', 'Other Reserves', 'equity', False, ''),
    ('321100', 'Income Surplus', 'equity', False, ''),
    ('321200', 'Dividends Declared', 'equity', False, FIN),
    ('331100', 'Current Year Earnings', 'equity_unaffected', False, ''),
    # ---- Income
    ('411100', 'Sales of Goods', 'income', False, ''),
    ('411200', 'Sales of Services', 'income', False, ''),
    ('411300', 'Export Sales', 'income', False, ''),
    ('411900', 'Sales Discounts and Returns', 'income', False, ''),
    ('421100', 'Interest Income', 'income_other', False, INV),
    ('421200', 'Rental Income', 'income_other', False, ''),
    ('421300', 'Gain on Disposal of Assets', 'income_other', False, INV),
    ('421400', 'Foreign Exchange Gain', 'income_other', False, ''),
    ('421500', 'Cash Difference Gain', 'income_other', False, ''),
    ('421600', 'Cash Discount Gain (Early Payment)', 'income_other', False, ''),
    ('421900', 'Other Income', 'income_other', False, ''),
    # ---- Cost of sales
    ('511100', 'Cost of Goods Sold', 'expense_direct_cost', False, ''),
    ('511200', 'Stock Variation', 'expense_direct_cost', False, ''),
    ('511300', 'Customs Duties and Freight on Purchases', 'expense_direct_cost', False, ''),
    ('512100', 'Direct Labour', 'expense_direct_cost', False, ''),
    ('512200', 'Subcontractors and Direct Services', 'expense_direct_cost', False, ''),
    # ---- Operating expenses
    ('611100', 'Salaries and Wages', 'expense', False, ''),
    ('611200', 'SSNIT Employer Contributions', 'expense', False, ''),
    ('611300', 'Pension Employer Contributions (Tier 2 and Tier 3)', 'expense', False, ''),
    ('611400', 'Staff Welfare and Medical', 'expense', False, ''),
    ('612100', 'Rent and Rates', 'expense', False, ''),
    ('612200', 'Utilities', 'expense', False, ''),
    ('612300', 'Repairs and Maintenance', 'expense', False, ''),
    ('612400', 'Insurance', 'expense', False, ''),
    ('613100', 'Professional and Legal Fees', 'expense', False, ''),
    ('613200', 'Audit Fees', 'expense', False, ''),
    ('614100', 'Advertising and Promotion', 'expense', False, ''),
    ('614200', 'Travel and Accommodation', 'expense', False, ''),
    ('614300', 'Motor Vehicle Running Expenses', 'expense', False, ''),
    ('614400', 'Telecommunications and Internet', 'expense', False, ''),
    ('614500', 'Office Supplies and Printing', 'expense', False, ''),
    ('615100', 'Bank Charges', 'expense', False, ''),
    ('615200', 'Bad Debts and Expected Credit Losses', 'expense', False, ''),
    ('615300', 'Training and Development', 'expense', False, ''),
    ('615400', 'Licences and Subscriptions', 'expense', False, ''),
    ('615500', 'Non-deductible Input VAT and Levies Written Off', 'expense', False, ''),
    ('615600', 'Cash Difference Loss', 'expense', False, ''),
    ('615700', 'Cash Discount Loss (Early Payment)', 'expense', False, ''),
    ('619900', 'Miscellaneous Expenses', 'expense', False, ''),
    # ---- Depreciation and amortisation
    ('641100', 'Depreciation - Buildings', 'expense_depreciation', False, ''),
    ('641200', 'Depreciation - Plant and Machinery', 'expense_depreciation', False, ''),
    ('641300', 'Depreciation - Motor Vehicles', 'expense_depreciation', False, ''),
    ('641400', 'Depreciation - Furniture and Fittings', 'expense_depreciation', False, ''),
    ('641500', 'Depreciation - Computer and IT Equipment', 'expense_depreciation', False, ''),
    ('641600', 'Depreciation - Right-of-Use Assets', 'expense_depreciation', False, ''),
    ('642100', 'Amortisation of Intangible Assets', 'expense_depreciation', False, ''),
    # ---- Finance costs
    ('711100', 'Interest on Loans and Overdrafts', 'expense_other', False, FIN),
    ('711200', 'Interest on Lease Liabilities (IFRS 16)', 'expense_other', False, FIN),
    ('711300', 'Foreign Exchange Loss', 'expense_other', False, ''),
    ('711900', 'Other Finance Costs', 'expense_other', False, FIN),
    # ---- Income tax expense
    ('811100', 'Current Income Tax Expense', 'expense_other', False, ''),
    ('812100', 'Deferred Income Tax Expense', 'expense_other', False, ''),
]


def acc_id(code):
    return 'gh' + code


# --------------------------------------------------------------------------------------
# 2. TAX GROUPS
# Source: vat_page, vat_notice, guide1151 (VAT, NHIL and GETFund Levy are three
# separate charges on the same value, and must appear on separate invoice lines);
# wht_page (withholding tax).
# Odoo 20 tax groups carry only id, name, country (no receivable/payable columns).
# --------------------------------------------------------------------------------------
TAX_GROUPS = [
    ('tax_group_gh_vat', 'VAT 15%'),
    ('tax_group_gh_nhil', 'NHIL 2.5%'),
    ('tax_group_gh_getfund', 'GETFund Levy 2.5%'),
    ('tax_group_gh_standard', 'VAT + NHIL + GETFund (20%)'),
    ('tax_group_gh_zero', 'VAT 0%'),
    ('tax_group_gh_exempt', 'VAT Exempt'),
    ('tax_group_gh_wht', 'Withholding Tax'),
]

# --------------------------------------------------------------------------------------
# 3. TAX TAGS
# Names are unsigned (src_chart_template). The sign lives in the report formula:
# sales-side base/tax balances are credits, so report formulas prefix them with '-'.
# --------------------------------------------------------------------------------------
TAG = {
    # sales
    'sales_std_base': 'Standard Rated Sales Base',
    'out_vat': 'Output VAT',
    'out_nhil': 'Output NHIL',
    'out_getfund': 'Output GETFund Levy',
    'sales_zero_base': 'Zero Rated Sales Base',
    'sales_export_base': 'Export Sales Base',
    'sales_fz_base': 'Free Zone Sales Base',
    'sales_exempt_base': 'Exempt Sales Base',
    # local purchases
    'purch_std_base': 'Standard Rated Purchases Base',
    'in_vat': 'Input VAT',
    'in_nhil': 'Input NHIL',
    'in_getfund': 'Input GETFund Levy',
    'purch_zero_base': 'Zero Rated Purchases Base',
    'purch_exempt_base': 'Exempt Purchases Base',
    # imports of goods
    'imp_base': 'Imports of Goods Base',
    'imp_vat': 'Import VAT',
    'imp_nhil': 'Import NHIL',
    'imp_getfund': 'Import GETFund Levy',
    # reverse charge on imported services
    'rc_base': 'Imported Services Base',
    'rc_in_vat': 'Reverse Charge Input VAT',
    'rc_in_nhil': 'Reverse Charge Input NHIL',
    'rc_in_getfund': 'Reverse Charge Input GETFund Levy',
    'rc_out_vat': 'Reverse Charge Output VAT',
    'rc_out_nhil': 'Reverse Charge Output NHIL',
    'rc_out_getfund': 'Reverse Charge Output GETFund Levy',
}

# --------------------------------------------------------------------------------------
# 4. WITHHOLDING TAX DEFINITIONS
# Source: wht_page (rates; resident and non-resident tables), wht_note s.4.6 (threshold
# GH¢2,000 and aggregation of contracts; WHT computed on the amount excluding
# VAT/NHIL), wht_codes (code cross-check).
# key, name, rate, threshold?, payable account, label, description
# --------------------------------------------------------------------------------------
THRESHOLD_NOTE = (
    'Applies only to payments exceeding GH¢2,000 per annum (contracts for the same goods, works or '
    'services in one financial year are aggregated). Odoo taxes cannot apply a threshold, so this tax '
    'must not be selected for payments below it. Source: GRA withholding tax page; GRA Practice Note '
    'DT/2016/001 s.4.6.'
)
WHT_PURCHASE = [
    # key, name, rate, threshold, account, report-group, description
    ('r_goods', 'WHT Resident - Supply of Goods 3%', 3.0, True, 'gh221500', 'resident',
     'Resident person: supply of goods exceeding GH¢2,000 per annum (GRA code WRESSUGEOA). ' + THRESHOLD_NOTE),
    ('r_works', 'WHT Resident - Supply of Works 5%', 5.0, True, 'gh221500', 'resident',
     'Resident person: supply of works exceeding GH¢2,000 per annum (GRA code WRESSWOA). ' + THRESHOLD_NOTE),
    ('r_services', 'WHT Resident - Supply of Services 7.5%', 7.5, True, 'gh221500', 'resident',
     'Resident person: supply of services by an entity exceeding GH¢2,000 per annum (GRA code WRESSSOIOA); '
     'the GRA page gives the same 7.5% for general services by an individual. ' + THRESHOLD_NOTE),
    ('r_rent_res', 'WHT Resident - Rent on Residential Property 8%', 8.0, False, 'gh221500', 'resident',
     'Resident person: rent on residential property (GRA code WRESRPRPOA). No GH¢2,000 threshold applies.'),
    ('r_rent_nonres', 'WHT Resident - Rent on Non-residential Property 15%', 15.0, False, 'gh221500', 'resident',
     'Resident person: rent on non-residential property (GRA code WRESRPNRPOA). No GH¢2,000 threshold applies.'),
    ('n_mgmt', 'WHT Non-resident - Management and Technical Service Fees 20%', 20.0, False, 'gh221600',
     'nonresident', 'Non-resident person: management and technical service fees (GRA code WNONMTSF).'),
    ('n_gws', 'WHT Non-resident - Goods, Works or Any Services 20%', 20.0, False, 'gh221600', 'nonresident',
     'Non-resident person: goods, works or any services (GRA codes WNONGSF, WNONPSF).'),
    ('n_roy', 'WHT Non-resident - Royalties, Natural Resource Payments and Rents 15%', 15.0, False,
     'gh221600', 'nonresident', 'Non-resident person: royalties, natural resource payments and rents (GRA code WNONNRRF).'),
    ('n_tel', 'WHT Non-resident - Telecommunication and Transportation Income 15%', 15.0, False,
     'gh221600', 'nonresident',
     'Non-resident person: income from telecommunication and transportation business (GRA codes WNONPRTCBF, WNONPRTBF).'),
    ('n_pet', 'WHT Non-resident - Petroleum Subcontractors 15%', 15.0, False, 'gh221600', 'nonresident',
     'Non-resident person: payments to petroleum subcontractors (GRA code WNONPPASF).'),
    ('n_ins', 'WHT Non-resident - General Insurance Premiums 5%', 5.0, False, 'gh221600', 'nonresident',
     'Non-resident person: general insurance premiums (GRA code WNONPPNIF).'),
]
# Sales-side WHT credits (tax withheld by our customers). Inactive by default.
# Source: wht_note s.8.0 - the withholdee of a non-final payment is entitled to a tax credit.
WHT_CREDIT = [
    ('c_goods', 'WHT Credit - Sale of Goods 3%', 3.0),
    ('c_works', 'WHT Credit - Sale of Works 5%', 5.0),
    ('c_services', 'WHT Credit - Sale of Services 7.5%', 7.5),
]


def wht_tags():
    out = {}
    for key, name, *_ in WHT_PURCHASE:
        short = name.rsplit(' ', 1)[0]
        out[key] = (short + ' Base', short + ' Tax')
    for key, name, _rate in WHT_CREDIT:
        short = name.rsplit(' ', 1)[0]
        out[key] = (short + ' Base', short + ' Tax')
    return out


WHT_TAG = wht_tags()

# --------------------------------------------------------------------------------------
# 5. TAXES
# Source: act1151 s.3 (VAT 15%), vat_page / vat_notice / guide1151 (NHIL 2.5%, GETFund 2.5%,
# same taxable value - none of the three is computed on another, so no include_base_amount),
# act1151 s.36 + Second Schedule (zero-rated), s.35 + First Schedule (exempt),
# act1151 s.34 / s.61 + guide1151 s.10 (import of services),
# import_export_page (import VAT is reclaimable as input tax).
# --------------------------------------------------------------------------------------
TAX_COLUMNS = [
    'id', 'description', 'invoice_label', 'type_tax_use', 'tax_scope', 'name', 'amount_type', 'amount',
    'tax_group_id', 'active', 'children_tax_ids', 'price_include_override',
    'repartition_line_ids/repartition_type', 'repartition_line_ids/document_type',
    'repartition_line_ids/tag_ids', 'repartition_line_ids/factor_percent', 'repartition_line_ids/account_id',
    'fiscal_position_ids', 'original_tax_ids',
]

FP_DOM = 'fiscal_position_gh_domestic'
FP_INT = 'fiscal_position_gh_international'
FP_FZ = 'fiscal_position_gh_free_zone'
FP_RC = 'fiscal_position_gh_import_services'

OUT = {'vat': 'gh221100', 'nhil': 'gh221200', 'getfund': 'gh221300'}
INP = {'vat': 'gh124100', 'nhil': 'gh124200', 'getfund': 'gh124300'}
LEVY = {  # levy -> (label, rate, tax group)
    'vat': ('VAT', 15.0, 'tax_group_gh_vat'),
    'nhil': ('NHIL', 2.5, 'tax_group_gh_nhil'),
    'getfund': ('GETFund Levy', 2.5, 'tax_group_gh_getfund'),
}

TAXES = []   # list of dict(row fields, reps=[(type, tag, factor, account)])


def add_tax(id_, name, type_, amount, group, reps, label='', description='', active=True, scope='',
            amount_type='percent', children='', price_include='', fps='', originals=''):
    TAXES.append(dict(
        id=id_, name=name, type=type_, amount=amount, group=group, reps=reps, label=label, description=description,
        active=active, scope=scope, amount_type=amount_type, children=children, price_include=price_include,
        fps=fps, originals=originals,
    ))


def vat_stack(prefix, type_, scope, tags, accounts, std_label, group_name, group_label, fps, originals, rc=False):
    """Three component taxes + the 20% group tax (levies on the same taxable value).

    The components must stay ACTIVE: Odoo 20.0 ignores inactive children of an active group tax when it
    computes tax lines (verified on a posted invoice: no VAT/NHIL/GETFund lines were generated while the
    children were archived; core l10n_in only ships inactive children inside inactive groups).
    """
    child_ids = []
    for levy in ('vat', 'nhil', 'getfund'):
        lname, rate, grp = LEVY[levy]
        tid = '%s_%s' % (prefix, levy)
        child_ids.append(tid)
        base_tag = tags['base'] if levy == 'vat' else ''  # base counted once, on the VAT component
        if rc:
            reps = [('base', base_tag, '', ''),
                    ('tax', tags['in'][levy], 100, INP[levy]),
                    ('tax', tags['out'][levy], -100, OUT[levy])]
        else:
            reps = [('base', base_tag, '', ''), ('tax', tags[levy], 100, accounts[levy])]
        add_tax(tid, '%s %s %s%%' % (std_label, lname, ('%g' % rate)), type_, rate, grp, reps,
                label='%s %g%%' % (lname, rate), active=True, scope=scope,
                description='Component of "%s" - select the group tax, not this component. %s %g%% on the same taxable '
                            'value as the other two charges.'
                            % (group_name, lname, rate))
    add_tax(prefix, group_name, type_, 100.0, 'tax_group_gh_standard', [], label=group_label, scope=scope,
            amount_type='group', children=','.join(child_ids), fps=fps, originals=originals,
            description='VAT 15% + NHIL 2.5% + GETFund Levy 2.5% = 20%, all charged on the same taxable value '
                        '(Act 1151 s.3; GRA VAT page; Guidelines s.5-6). Not cascading.')
    return prefix


# ---- Sales
vat_stack('gh_st', 'sale', '',
          dict(base=TAG['sales_std_base'], vat=TAG['out_vat'], nhil=TAG['out_nhil'], getfund=TAG['out_getfund']),
          OUT, 'Sales', 'Sales Standard 20% (VAT 15% + NHIL 2.5% + GETFund 2.5%)', 'VAT 15% + NHIL 2.5% + GETFund 2.5%',
          FP_DOM, '')
add_tax('gh_st_zero', 'Sales Zero-Rated 0%', 'sale', 0.0, 'tax_group_gh_zero',
        [('base', TAG['sales_zero_base'], '', ''), ('tax', '', 100, '')], label='0%', fps=FP_DOM,
        description='Domestic supplies zero-rated under Act 1151 s.36 and the Second Schedule (e.g. locally manufactured '
                    'sanitary towels; locally manufactured textiles until 31 December 2028 - GRA VAT page). '
                    'NHIL and GETFund are also 0% on zero-rated supplies.')
add_tax('gh_st_export', 'Sales Export 0%', 'sale', 0.0, 'tax_group_gh_zero',
        [('base', TAG['sales_export_base'], '', ''), ('tax', '', 100, '')], label='Export 0%',
        fps=FP_INT, originals='gh_st,gh_st_zero,gh_st_exempt',
        description='Export of goods and services, zero-rated under Act 1151 s.36 / Second Schedule. Retain the documentary '
                    'proof required by s.36(2). NHIL and GETFund are also 0%.')
add_tax('gh_st_free_zone', 'Sales Free Zone 0%', 'sale', 0.0, 'tax_group_gh_zero',
        [('base', TAG['sales_fz_base'], '', ''), ('tax', '', 100, '')], label='Free Zone 0%',
        fps=FP_FZ, originals='gh_st,gh_st_zero,gh_st_exempt',
        description='Supply of goods to a free zone developer or enterprise, zero-rated when the documentation required by '
                    'the Free Zones Act, 1995 (Act 504) and the GRA practice note is held. Supplies of SERVICES to a free '
                    'zone developer or enterprise are taxable at the standard rate (GRA Guidelines s.14), so do not '
                    'use the Free Zone fiscal position for services.')
add_tax('gh_st_exempt', 'Sales Exempt', 'sale', 0.0, 'tax_group_gh_exempt',
        [('base', TAG['sales_exempt_base'], '', ''), ('tax', '', 100, '')], label='Exempt', fps=FP_DOM,
        description='Exempt supplies listed in the First Schedule of Act 1151 (s.35). Exempt from VAT, NHIL and GETFund.')

# ---- Local purchases
vat_stack('gh_pt', 'purchase', '',
          dict(base=TAG['purch_std_base'], vat=TAG['in_vat'], nhil=TAG['in_nhil'], getfund=TAG['in_getfund']),
          INP, 'Purchases', 'Purchases Standard 20% (VAT 15% + NHIL 2.5% + GETFund 2.5%)',
          'VAT 15% + NHIL 2.5% + GETFund 2.5%', FP_DOM, '')
add_tax('gh_pt_zero', 'Purchases Zero-Rated 0%', 'purchase', 0.0, 'tax_group_gh_zero',
        [('base', TAG['purch_zero_base'], '', ''), ('tax', '', 100, '')], label='0%',
        fps=','.join([FP_DOM, FP_INT, FP_RC]),
        description='Purchases of zero-rated supplies (Act 1151 s.36 / Second Schedule).')
add_tax('gh_pt_exempt', 'Purchases Exempt', 'purchase', 0.0, 'tax_group_gh_exempt',
        [('base', TAG['purch_exempt_base'], '', ''), ('tax', '', 100, '')], label='Exempt',
        fps=','.join([FP_DOM, FP_INT, FP_RC]),
        description='Purchases of exempt supplies (Act 1151 s.35 / First Schedule) and exempt imports (s.37).')

# ---- Imports of goods: VAT + NHIL + GETFund collected at importation, recoverable as input tax
# Source: act1151 s.34(1)(a), import_export_page; levies on imports of goods: pwc_other (secondary; not
# otherwise confirmed in the Act text read, see README "Unverified / needs review").
vat_stack('gh_imp', 'purchase', 'consu',
          dict(base=TAG['imp_base'], vat=TAG['imp_vat'], nhil=TAG['imp_nhil'], getfund=TAG['imp_getfund']),
          INP, 'Import', 'Import of Goods 20% (VAT 15% + NHIL 2.5% + GETFund 2.5%)',
          'Import VAT 15% + NHIL 2.5% + GETFund 2.5%', FP_INT, 'gh_pt')

# ---- Reverse charge on imported services
# Source: act1151 s.34(1)(b) and s.61 (import of services - tax payable by the recipient), guide1151 s.10
# (VAT 15% + NHIL/GETFund 5% on the value of the imported service). The +100% / -100% lines net to
# zero: input tax claimed = output tax declared. GRA Guidelines s.10 treat imported services used
# to make TAXABLE supplies as outside the import-of-services charge; use this tax where the charge applies.
vat_stack('gh_rc', 'purchase', 'service',
          dict(base=TAG['rc_base'],
               **{'in': {'vat': TAG['rc_in_vat'], 'nhil': TAG['rc_in_nhil'], 'getfund': TAG['rc_in_getfund']},
                  'out': {'vat': TAG['rc_out_vat'], 'nhil': TAG['rc_out_nhil'], 'getfund': TAG['rc_out_getfund']}}),
          None, 'Reverse Charge', 'Import of Services - Reverse Charge 20% (VAT 15% + NHIL 2.5% + GETFund 2.5%)',
          'Reverse charge: VAT 15% + NHIL 2.5% + GETFund 2.5%', FP_RC, 'gh_pt', rc=True)

# ---- Withholding tax on supplier payments (we are the withholding agent)
for key, name, rate, thr, account, _grp, desc in WHT_PURCHASE:
    base_tag, tax_tag = WHT_TAG[key]
    add_tax('gh_wht_' + key, name, 'purchase', -rate, 'tax_group_gh_wht',
            [('base', base_tag, '', ''), ('tax', tax_tag, 100, account)],
            label='WHT %g%%' % rate, price_include='tax_excluded', description=desc)

# ---- Sales-side WHT credits (inactive by default)
for key, name, rate in WHT_CREDIT:
    base_tag, tax_tag = WHT_TAG[key]
    add_tax('gh_wht_' + key, name, 'sale', -rate, 'tax_group_gh_wht',
            [('base', base_tag, '', ''), ('tax', tax_tag, 100, 'gh124500')],
            label='WHT credit %g%%' % rate, price_include='tax_excluded', active=False,
            description='Tax withheld by a customer on payment to us; creditable against our income tax '
                        '(GRA Practice Note DT/2016/001 s.8.0). Inactive by default - activate only if you are '
                        'subject to withholding. ' + THRESHOLD_NOTE)


def write_taxes():
    path = os.path.join(TPL, 'account.tax-gh.csv')
    with open(path, 'w', newline='', encoding='utf-8') as fh:
        w = csv.writer(fh, quoting=csv.QUOTE_ALL, lineterminator='\n')
        w.writerow(TAX_COLUMNS)
        for t in TAXES:
            reps = t['reps']
            rows = []
            for doc in ('invoice', 'refund'):
                for rtype, tag, factor, account in reps:
                    rows.append((rtype, doc, tag, factor, account))
            head = [t['id'], t['description'], t['label'], t['type'], t['scope'], t['name'], t['amount_type'],
                    '%g' % t['amount'] if t['amount_type'] == 'percent' else '100.0', t['group'],
                    '1' if t['active'] else '0', t['children'], t['price_include']]
            tail = [t['fps'], t['originals']]
            if not rows:  # group tax: no repartition lines
                w.writerow(head + ['', '', '', '', ''] + tail)
                continue
            for i, r in enumerate(rows):
                rtype, doc, tag, factor, account = r
                rep = [rtype, doc, tag, ('%g' % factor) if factor != '' else '', account]
                if i == 0:
                    w.writerow(head + rep + tail)
                else:
                    w.writerow([''] * len(head) + rep + ['', ''])


def write_accounts():
    seen = set()
    path = os.path.join(TPL, 'account.account-gh.csv')
    with open(path, 'w', newline='', encoding='utf-8') as fh:
        w = csv.writer(fh, quoting=csv.QUOTE_ALL, lineterminator='\n')
        w.writerow(['id', 'name', 'code', 'account_type', 'tag_ids', 'reconcile', 'non_trade'])
        for code, name, atype, rec, tags in ACCOUNTS:
            assert code not in seen and len(code) == 6, code
            seen.add(code)
            w.writerow([acc_id(code), name, code, atype, tags, 'True' if rec else 'False', ''])


def write_tax_groups():
    with open(os.path.join(TPL, 'account.tax.group-gh.csv'), 'w', newline='', encoding='utf-8') as fh:
        w = csv.writer(fh, quoting=csv.QUOTE_ALL, lineterminator='\n')
        w.writerow(['id', 'name', 'country_id'])
        for gid, name in TAX_GROUPS:
            w.writerow([gid, name, 'base.gh'])


# --------------------------------------------------------------------------------------
# 6. FISCAL POSITIONS
# Source: vat_page / import_export_page / act1151 s.36 (exports 0%), act1151 s.34 (imports),
# guide1151 s.14 (free zones). Odoo semantics: addons/account/models/partner.py (map_tax).
# --------------------------------------------------------------------------------------
FISCAL_POSITIONS = [
    # id, sequence, name, auto_apply, country
    (FP_DOM, 1, 'Domestic (Ghana)', 1, 'base.gh'),
    (FP_INT, 2, 'International (Exports and Imports)', 1, ''),
    (FP_FZ, 3, 'Free Zone Enterprise', 0, ''),
    (FP_RC, 4, 'Imported Services (Reverse Charge)', 0, ''),
]


def write_fiscal_positions():
    with open(os.path.join(TPL, 'account.fiscal.position-gh.csv'), 'w', newline='', encoding='utf-8') as fh:
        w = csv.writer(fh, quoting=csv.QUOTE_ALL, lineterminator='\n')
        w.writerow(['id', 'sequence', 'name', 'auto_apply', 'vat_required', 'country_id', 'country_group_id'])
        for fid, seq, name, auto, country in FISCAL_POSITIONS:
            w.writerow([fid, seq, name, auto, '', country, ''])


# --------------------------------------------------------------------------------------
# 7. STATES
# Source: wiki_iso (secondary) - the iso.org page could not be opened (HTTP 403).
# ISO 3166-2:GH: 16 regions. GH-BA (Brong-Ahafo) was deleted 2019-11-22 and is NOT created.
# Pattern: src_in_states.
# --------------------------------------------------------------------------------------
STATES = [
    ('AF', 'Ahafo'), ('AH', 'Ashanti'), ('BO', 'Bono'), ('BE', 'Bono East'), ('CP', 'Central'),
    ('EP', 'Eastern'), ('AA', 'Greater Accra'), ('NE', 'North East'), ('NP', 'Northern'), ('OT', 'Oti'),
    ('SV', 'Savannah'), ('UE', 'Upper East'), ('UW', 'Upper West'), ('TV', 'Volta'), ('WP', 'Western'),
    ('WN', 'Western North'),
]


def write_states():
    lines = ['<?xml version="1.0" encoding="utf-8"?>', '<odoo>',
             '    <!-- Source: ISO 3166-2:GH, 16 regions (cross-checked on Wikipedia; iso.org returned HTTP 403).',
             '         GH-BA (Brong-Ahafo) was deleted on 2019-11-22 and is intentionally absent. -->', '']
    for code, name in STATES:
        lines += ['    <record id="state_gh_%s" model="res.country.state">' % code.lower(),
                  '        <field name="name">%s</field>' % escape(name),
                  '        <field name="code">%s</field>' % code,
                  '        <field name="country_id" ref="base.gh"/>',
                  '    </record>', '']
    lines.append('</odoo>')
    open(os.path.join(DATA, 'res_country_state_data.xml'), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')


# --------------------------------------------------------------------------------------
# 8. REPORT XML HELPERS
# --------------------------------------------------------------------------------------
class Report:
    """Small writer for account.report XML (Odoo 20 format, see src_ke_report)."""

    def __init__(self, rid, name, columns, extra_fields='', root_generic_tax=False, comment=''):
        self.rid, self.name, self.columns, self.extra = rid, name, columns, extra_fields
        self.root_generic_tax = root_generic_tax
        self.comment = comment
        self.lines = []

    def line(self, lid, name, code=None, exprs=None, formula_attrs=None, children=None, extra=''):
        self.lines.append(dict(lid=lid, name=name, code=code, exprs=exprs or [], attrs=formula_attrs or {},
                               children=children or [], extra=extra))
        return self.lines[-1]

    def render_line(self, ln, indent):
        p = ' ' * indent
        out = [p + '<record id="%s" model="account.report.line">' % ln['lid'],
               p + '    <field name="name">%s</field>' % escape(ln['name'])]
        if ln['code']:
            out.append(p + '    <field name="code">%s</field>' % ln['code'])
        for k, v in ln['attrs'].items():
            if isinstance(v, bool):
                out.append(p + '    <field name="%s" eval="%s"/>' % (k, v))
            else:
                out.append(p + '    <field name="%s">%s</field>' % (k, escape(str(v))))
        if ln['extra']:
            out.append(ln['extra'])
        if ln['exprs']:
            out.append(p + '    <field name="expression_ids">')
            for e in ln['exprs']:
                out.append(p + '        <record id="%s" model="account.report.expression">' % e['id'])
                out.append(p + '            <field name="label">%s</field>' % e['label'])
                out.append(p + '            <field name="engine">%s</field>' % e['engine'])
                if 'formula_eval' in e:
                    out.append(p + '            <field name="formula" eval="%s"/>' % escape(e['formula_eval'], {'"': '&quot;'}))
                else:
                    out.append(p + '            <field name="formula">%s</field>' % escape(e['formula']))
                for k in ('subformula', 'date_scope', 'carryover_target'):
                    if e.get(k):
                        out.append(p + '            <field name="%s">%s</field>' % (k, escape(e[k])))
                out.append(p + '        </record>')
            out.append(p + '    </field>')
        if ln['children']:
            out.append(p + '    <field name="children_ids">')
            for c in ln['children']:
                out += self.render_line(c, indent + 8)
            out.append(p + '    </field>')
        out.append(p + '</record>')
        return out

    def render(self):
        o = ['<?xml version="1.0" encoding="utf-8"?>', '<odoo auto_sequence="1">']
        if self.comment:
            o += ['    <!-- ' + self.comment.replace('\n', '\n         ') + ' -->']
        o += ['    <record id="%s" model="account.report">' % self.rid,
              '        <field name="name">%s</field>' % escape(self.name)]
        if self.root_generic_tax:
            o += ['        <field name="root_report_id" ref="account.generic_tax_report"/>',
                  '        <field name="country_id" ref="base.gh"/>',
                  '        <field name="allow_foreign_vat" eval="False"/>',
                  '        <field name="availability_condition">country</field>']
        if self.extra:
            o.append(self.extra)
        o.append('        <field name="column_ids">')
        for cid, cname, label in self.columns:
            o += ['            <record id="%s" model="account.report.column">' % cid,
                  '                <field name="name">%s</field>' % escape(cname),
                  '                <field name="expression_label">%s</field>' % label,
                  '            </record>']
        o.append('        </field>')
        o.append('        <field name="line_ids">')
        for ln in self.lines:
            o += self.render_line(ln, 12)
        o += ['        </field>', '    </record>', '</odoo>']
        return '\n'.join(o) + '\n'


def tag_formula(tag_name, negate):
    return ('-' if negate else '') + tag_name


# --------------------------------------------------------------------------------------
# 9. VAT RETURN
# Source: vat_page (rates, deadline: last working day of the month after the return period),
# vat_notice, guide1151 s.10 (imported services), s.12.1, act1151 s.49-52 (deductible and
# non-deductible input tax: motor vehicles, entertainment, clubs, mixed supplies).
# Layout check against the (pre-2026) GRA form dt0135: outputs, zero-rated, exempt, local inputs,
# imports, credit brought forward. No Act 1151 return form was published on the GRA forms page,
# so the four columns (Taxable Value / VAT / NHIL / GETFund) follow the build brief.
# Carryover pattern: src_ke_report.
# --------------------------------------------------------------------------------------
COLS = ['base', 'vat', 'nhil', 'getfund']
TAXCOLS = COLS[1:]


def build_vat_report():
    r = Report('tax_report_gh_vat', 'VAT Return',
               [('tax_report_gh_vat_col_base', 'Taxable Value', 'base'),
                ('tax_report_gh_vat_col_vat', 'VAT', 'vat'),
                ('tax_report_gh_vat_col_nhil', 'NHIL', 'nhil'),
                ('tax_report_gh_vat_col_getfund', 'GETFund Levy', 'getfund')],
               root_generic_tax=True,
               comment='Source: Value Added Tax Act, 2025 (Act 1151); GRA VAT page and Notice; GRA VAT Guidelines '
                       'GRA/AG/25/002 (see REFERENCES.md). Return layout cross-checked against GRA form DT 0135 (pre-2026).')

    def ex(code, label, engine, formula, **kw):
        e = dict(id='tax_report_gh_vat_%s_%s' % (code.lower(), label.strip('_')), label=label, engine=engine,
                 formula=formula)
        e.update(kw)
        return e

    def tags_line(code, name, tagmap, negate, sections=None):
        """tagmap: label -> tag key."""
        return r.line('tax_report_gh_vat_line_' + code.lower(), name, code,
                      [ex(code, lab, 'tax_tags', tag_formula(TAG[key], negate)) for lab, key in tagmap.items()])

    def agg_line(code, name, formulas):
        return r.line('tax_report_gh_vat_line_' + code.lower(), name, code,
                      [ex(code, lab, 'aggregation', f) for lab, f in formulas.items()])

    # --- A. Output tax (sales)
    r.line('tax_report_gh_vat_sec_out', 'A. OUTPUT TAX (SALES)', None, [], dict(hierarchy_level=0))
    tags_line('GH_01', '1. Standard-rated sales (VAT 15% + NHIL 2.5% + GETFund 2.5%)',
              dict(base='sales_std_base', vat='out_vat', nhil='out_nhil', getfund='out_getfund'), True)
    tags_line('GH_02', '2. Zero-rated sales', dict(base='sales_zero_base'), True)
    tags_line('GH_03', '3. Export sales (zero-rated)', dict(base='sales_export_base'), True)
    tags_line('GH_04', '4. Free zone sales (zero-rated)', dict(base='sales_fz_base'), True)
    tags_line('GH_05', '5. Exempt sales', dict(base='sales_exempt_base'), True)
    agg_line('GH_06', '6. Total sales',
             dict(base='GH_01.base + GH_02.base + GH_03.base + GH_04.base + GH_05.base',
                  vat='GH_01.vat', nhil='GH_01.nhil', getfund='GH_01.getfund'))
    tags_line('GH_07', '7. Reverse charge on imported services (output tax)',
              dict(vat='rc_out_vat', nhil='rc_out_nhil', getfund='rc_out_getfund'), True)
    agg_line('GH_08', '8. Total output tax',
             {c: 'GH_06.%s + GH_07.%s' % (c, c) for c in TAXCOLS})

    # --- B. Input tax (purchases)
    r.line('tax_report_gh_vat_sec_in', 'B. INPUT TAX (PURCHASES)', None, [], dict(hierarchy_level=0))
    tags_line('GH_11', '11. Standard-rated local purchases',
              dict(base='purch_std_base', vat='in_vat', nhil='in_nhil', getfund='in_getfund'), False)
    tags_line('GH_12', '12. Imports of goods',
              dict(base='imp_base', vat='imp_vat', nhil='imp_nhil', getfund='imp_getfund'), False)
    tags_line('GH_13', '13. Imported services (reverse charge, input tax)',
              dict(base='rc_base', vat='rc_in_vat', nhil='rc_in_nhil', getfund='rc_in_getfund'), False)
    tags_line('GH_14', '14. Zero-rated purchases', dict(base='purch_zero_base'), False)
    tags_line('GH_15', '15. Exempt purchases', dict(base='purch_exempt_base'), False)
    agg_line('GH_16', '16. Total purchases',
             dict(base='GH_11.base + GH_12.base + GH_13.base + GH_14.base + GH_15.base'))
    agg_line('GH_17', '17. Total input tax',
             {c: 'GH_11.%s + GH_12.%s + GH_13.%s' % (c, c, c) for c in TAXCOLS})
    r.line('tax_report_gh_vat_line_gh_18', '18. Non-deductible input tax (enter manually - Act 1151 s.50, s.52)', 'GH_18',
           [ex('GH_18', c, 'external', 'sum', subformula='editable;rounding=2') for c in TAXCOLS])
    agg_line('GH_19', '19. Deductible input tax', {c: 'GH_17.%s - GH_18.%s' % (c, c) for c in TAXCOLS})

    # --- C. Net position and carry-over
    r.line('tax_report_gh_vat_sec_net', 'C. NET TAX AND CREDIT CARRY-OVER', None, [], dict(hierarchy_level=0))
    agg_line('GH_21', '21. Net tax payable / (credit) for the period', {c: 'GH_08.%s - GH_19.%s' % (c, c) for c in TAXCOLS})
    exprs = []
    for c in TAXCOLS:
        exprs.append(ex('GH_22', '_applied_carryover_' + c, 'external', 'most_recent', date_scope='previous_return_period'))
        exprs.append(ex('GH_22', c, 'aggregation', '-GH_22._applied_carryover_' + c))
    r.line('tax_report_gh_vat_line_gh_22', '22. Credit brought forward from previous period', 'GH_22', exprs)
    exprs = []
    for c in TAXCOLS:
        exprs.append(ex('GH_23', c, 'aggregation', 'GH_21.%s - GH_22.%s' % (c, c)))
        exprs.append(ex('GH_23', '_carryover_' + c, 'aggregation', 'GH_23.' + c,
                        carryover_target='GH_22._applied_carryover_' + c, subformula='if_below(GHS(0))'))
    r.line('tax_report_gh_vat_line_gh_23', '23. Net tax payable / (credit carried forward)', 'GH_23', exprs)
    return r


# --------------------------------------------------------------------------------------
# 10. WITHHOLDING TAX REPORT
# Source: wht_page (categories and rates), wht_return (DT 110 layout: gross amount of payment, WHT type,
# rate, tax withheld), wht_note s.5-6 (remit and file within 15 days after month end).
# --------------------------------------------------------------------------------------
def build_wht_report():
    r = Report('tax_report_gh_wht', 'Withholding Tax Report',
               [('tax_report_gh_wht_col_base', 'Payment Base', 'base'),
                ('tax_report_gh_wht_col_tax', 'Tax Withheld', 'tax')],
               root_generic_tax=True,
               comment='Source: GRA Withholding Tax page (resident and non-resident rate tables); GRA Practice Note '
                       'DT/2016/001; GRA form DT 110 layout (see REFERENCES.md). Report is registered under the '
                       'generic tax report for Ghana.')
    n = [0]

    def code():
        n[0] += 1
        return 'GH_WHT_%02d' % n[0]

    def tag_line(key, label, negate_base, negate_tax):
        c = code()
        base_tag, tax_tag = WHT_TAG[key]
        return r.line('tax_report_gh_wht_line_' + key, label, c, [
            dict(id='tax_report_gh_wht_%s_base' % key, label='base', engine='tax_tags',
                 formula=tag_formula(base_tag, negate_base)),
            dict(id='tax_report_gh_wht_%s_tax' % key, label='tax', engine='tax_tags',
                 formula=tag_formula(tax_tag, negate_tax)),
        ]), c

    def total_line(lid, label, codes):
        c = code()
        r.line(lid, label, c, [
            dict(id=lid + '_base', label='base', engine='aggregation', formula=' + '.join(x + '.base' for x in codes)),
            dict(id=lid + '_tax', label='tax', engine='aggregation', formula=' + '.join(x + '.tax' for x in codes)),
        ])
        return c

    r.line('tax_report_gh_wht_sec_withheld', 'A. TAX WITHHELD ON PAYMENTS TO SUPPLIERS', None, [], dict(hierarchy_level=0))
    res_codes, non_codes = [], []
    # purchase side: base is a debit (+), tax withheld is a credit (-) -> negate the tax tag
    r.line('tax_report_gh_wht_sec_res', 'Resident payees', None, [], dict(hierarchy_level=1))
    for key, name, _rate, _thr, _acc, grp, _d in WHT_PURCHASE:
        if grp == 'resident':
            _, c = tag_line(key, name.replace('WHT Resident - ', ''), False, True)
            res_codes.append(c)
    c_res = total_line('tax_report_gh_wht_total_res', 'Total - resident payees', res_codes)
    r.line('tax_report_gh_wht_sec_non', 'Non-resident payees', None, [], dict(hierarchy_level=1))
    for key, name, _rate, _thr, _acc, grp, _d in WHT_PURCHASE:
        if grp == 'nonresident':
            _, c = tag_line(key, name.replace('WHT Non-resident - ', ''), False, True)
            non_codes.append(c)
    c_non = total_line('tax_report_gh_wht_total_non', 'Total - non-resident payees', non_codes)
    c_tot = total_line('tax_report_gh_wht_total_withheld', 'Total tax withheld (to remit to GRA)', [c_res, c_non])

    # sales side: base is a credit (-), tax credit is a debit (+)
    r.line('tax_report_gh_wht_sec_credit', 'B. WITHHOLDING TAX CREDITS (TAX WITHHELD BY OUR CUSTOMERS)', None, [],
           dict(hierarchy_level=0))
    cr_codes = []
    for key, name, _rate in WHT_CREDIT:
        _, c = tag_line(key, name.replace('WHT Credit - ', ''), True, False)
        cr_codes.append(c)
    total_line('tax_report_gh_wht_total_credit', 'Total withholding tax credits', cr_codes)
    return r


# --------------------------------------------------------------------------------------
# 11. FINANCIAL REPORTS (IFRS-style presentation, by account code prefix)
# Not a legal requirement - presentation only. Registered stand-alone (no root_report_id)
# because the Balance Sheet / P&L roots live in the Enterprise account_reports module and
# this module depends on `account` only. Structure pattern: src_ee_report.
# --------------------------------------------------------------------------------------
def build_balance_sheet():
    r = Report('financial_report_gh_balance_sheet', 'Balance Sheet (Statement of Financial Position)',
               [('financial_report_gh_bs_col', 'Balance', 'balance')],
               extra_fields='',
               comment='Source: IFRS (IAS 1) presentation of the l10n_gh chart of accounts; no legal rate or threshold '
                       'is used in this report.')
    r.extra = '\n'.join([
        '        <field name="country_id" ref="base.gh"/>',
        '        <field name="availability_condition">country</field>',
        '        <field name="groupby">account_id</field>',
        '        <field name="filter_unfold_all" eval="True"/>',
        '        <field name="filter_date_range" eval="False"/>',
        '        <field name="filter_journals" eval="True"/>',
    ])

    def codes(lid, name, code, formula, **attrs):
        return dict(lid=lid, name=name, code=code, exprs=[], attrs=dict(account_codes_formula=formula, **attrs),
                    children=[], extra='')

    def agg(lid, name, code, formula, children=None, level=None):
        attrs = dict(aggregation_formula=formula)
        if level is not None:
            attrs['hierarchy_level'] = level
        return dict(lid=lid, name=name, code=code, exprs=[], attrs=attrs, children=children or [], extra='')

    P = 'financial_report_gh_bs_'
    nca = agg(P + 'nca', 'Non-current Assets', 'GH_BS_NCA', 'GH_BS_PPE.balance + GH_BS_INT.balance + GH_BS_INV.balance + GH_BS_DTA.balance', [
        codes(P + 'ppe', 'Property, Plant and Equipment (net of depreciation)', 'GH_BS_PPE', '111 + 112'),
        codes(P + 'int', 'Intangible Assets (net of amortisation)', 'GH_BS_INT', '113'),
        codes(P + 'inv', 'Investments and Investment Property', 'GH_BS_INV', '114'),
        codes(P + 'dta', 'Deferred Tax Asset', 'GH_BS_DTA', '115'),
    ])
    ca = agg(P + 'ca', 'Current Assets', 'GH_BS_CA',
             'GH_BS_INVT.balance + GH_BS_REC.balance + GH_BS_TAXR.balance + GH_BS_CASH.balance', [
        codes(P + 'invt', 'Inventories', 'GH_BS_INVT', '121'),
        codes(P + 'rec', 'Trade and Other Receivables and Prepayments', 'GH_BS_REC', '122 + 123'),
        codes(P + 'taxr', 'Tax Receivables (VAT, NHIL, GETFund, WHT, Income Tax)', 'GH_BS_TAXR', '124'),
        codes(P + 'cash', 'Cash and Cash Equivalents', 'GH_BS_CASH', '131 + 132 + 133'),
    ])
    assets = agg(P + 'assets', 'ASSETS', 'GH_BS_TA', 'GH_BS_NCA.balance + GH_BS_CA.balance', [nca, ca], level=0)

    ncl = agg(P + 'ncl', 'Non-current Liabilities', 'GH_BS_NCL',
              'GH_BS_LOAN.balance + GH_BS_LEASE.balance + GH_BS_DTL.balance + GH_BS_PROV.balance', [
        codes(P + 'loan', 'Long-term Loans', 'GH_BS_LOAN', '-231'),
        codes(P + 'lease', 'Lease Liabilities (IFRS 16)', 'GH_BS_LEASE', '-232'),
        codes(P + 'dtl', 'Deferred Tax Liability', 'GH_BS_DTL', '-233'),
        codes(P + 'prov', 'Provisions and Employee Benefits', 'GH_BS_PROV', '-234'),
    ])
    cl = agg(P + 'cl', 'Current Liabilities', 'GH_BS_CL',
             'GH_BS_PAY.balance + GH_BS_BORR.balance + GH_BS_TAXP.balance', [
        codes(P + 'pay', 'Trade and Other Payables', 'GH_BS_PAY', '-2111 - 2112 - 2113 - 2114 - 2115'),
        codes(P + 'borr', 'Borrowings and Current Lease Liabilities', 'GH_BS_BORR', '-212'),
        codes(P + 'taxp', 'Tax and Statutory Payables (VAT, NHIL, GETFund, WHT, PAYE, SSNIT)', 'GH_BS_TAXP', '-22'),
    ])
    liabs = agg(P + 'liabs', 'LIABILITIES', 'GH_BS_TL', 'GH_BS_NCL.balance + GH_BS_CL.balance', [ncl, cl], level=0)

    cye = dict(lid=P + 'cye', name='Current Year Earnings', code='GH_BS_CYE', attrs=dict(), children=[], extra='',
               exprs=[dict(id=P + 'cye_balance', label='balance', engine='domain',
                           formula_eval="[('account_id.account_type', 'in', ['income', 'income_other', 'expense_direct_cost', "
                                        "'expense', 'expense_depreciation', 'expense_other', 'equity_unaffected'])]",
                           subformula='-sum', date_scope='from_fiscalyear')])
    pye = dict(lid=P + 'pye', name='Previous Years Earnings (not yet in Income Surplus)', code='GH_BS_PYE', attrs=dict(),
               children=[], extra='',
               exprs=[dict(id=P + 'pye_balance', label='balance', engine='domain',
                           formula_eval="[('account_id.account_type', 'in', ['income', 'income_other', 'expense_direct_cost', "
                                        "'expense', 'expense_depreciation', 'expense_other', 'equity_unaffected'])]",
                           subformula='-sum', date_scope='to_beginning_of_fiscalyear')])
    equity = agg(P + 'equity', 'EQUITY', 'GH_BS_TE',
                 'GH_BS_SC.balance + GH_BS_RES.balance + GH_BS_IS.balance + GH_BS_CYE.balance + GH_BS_PYE.balance', [
        codes(P + 'sc', 'Stated Capital', 'GH_BS_SC', '-3111'),
        codes(P + 'res', 'Reserves', 'GH_BS_RES', '-312'),
        codes(P + 'is', 'Income Surplus', 'GH_BS_IS', '-321'),
        cye, pye,
    ], level=0)
    total = agg(P + 'tle', 'LIABILITIES + EQUITY', 'GH_BS_TLE', 'GH_BS_TE.balance + GH_BS_TL.balance', level=0)
    r.lines = [assets, liabs, equity, total]
    return r


def build_profit_loss():
    r = Report('financial_report_gh_profit_loss', 'Profit and Loss (Statement of Profit or Loss)',
               [('financial_report_gh_pl_col', 'Balance', 'balance')],
               comment='Source: IFRS (IAS 1) presentation of the l10n_gh chart of accounts; no legal rate or threshold is '
                       'used in this report.')
    r.extra = '\n'.join([
        '        <field name="country_id" ref="base.gh"/>',
        '        <field name="availability_condition">country</field>',
        '        <field name="groupby">account_id</field>',
        '        <field name="filter_unfold_all" eval="True"/>',
        '        <field name="filter_journals" eval="True"/>',
    ])
    P = 'financial_report_gh_pl_'

    def domain_line(lid, name, code, atype, sign, level=None):
        attrs = dict(hierarchy_level=level) if level is not None else {}
        return dict(lid=lid, name=name, code=code, attrs=attrs, children=[], extra='',
                    exprs=[dict(id=lid + '_balance', label='balance', engine='domain',
                                formula_eval="[('account_id.account_type', '=', '%s')]" % atype, subformula=sign)])

    def agg(lid, name, code, formula, level=None):
        attrs = dict(aggregation_formula=formula)
        if level is not None:
            attrs['hierarchy_level'] = level
        return dict(lid=lid, name=name, code=code, exprs=[], attrs=attrs, children=[], extra='')

    def codes(lid, name, code, formula):
        return dict(lid=lid, name=name, code=code, exprs=[], attrs=dict(account_codes_formula=formula), children=[], extra='')

    rev = domain_line(P + 'rev', 'Revenue', 'GH_PL_REV', 'income', '-sum', 1)
    cos = domain_line(P + 'cos', 'Cost of Sales', 'GH_PL_COS', 'expense_direct_cost', '-sum', 1)
    gp = agg(P + 'gp', 'GROSS PROFIT', 'GH_PL_GP', 'GH_PL_REV.balance + GH_PL_COS.balance', 0)
    oth = domain_line(P + 'oth', 'Other Income', 'GH_PL_OTH', 'income_other', '-sum', 1)
    opex = domain_line(P + 'opex', 'Operating Expenses', 'GH_PL_OPEX', 'expense', '-sum', 1)
    dep = domain_line(P + 'dep', 'Depreciation and Amortisation', 'GH_PL_DEP', 'expense_depreciation', '-sum', 1)
    ebit = agg(P + 'ebit', 'OPERATING PROFIT', 'GH_PL_EBIT',
               'GH_PL_GP.balance + GH_PL_OTH.balance + GH_PL_OPEX.balance + GH_PL_DEP.balance', 0)
    fin = codes(P + 'fin', 'Finance Costs (incl. IFRS 16 lease interest and FX losses)', 'GH_PL_FIN', '-71')
    pbt = agg(P + 'pbt', 'PROFIT BEFORE TAX', 'GH_PL_PBT', 'GH_PL_EBIT.balance + GH_PL_FIN.balance', 0)
    tax = codes(P + 'tax', 'Income Tax Expense (current and deferred)', 'GH_PL_TAX', '-81')
    pat = agg(P + 'pat', 'PROFIT FOR THE PERIOD', 'GH_PL_PAT', 'GH_PL_PBT.balance + GH_PL_TAX.balance', 0)
    r.lines = [rev, cos, gp, oth, opex, dep, ebit, fin, pbt, tax, pat]
    return r


# --------------------------------------------------------------------------------------
def write_reports():
    for fname, builder in (('account_vat_report_data.xml', build_vat_report),
                           ('account_wht_report_data.xml', build_wht_report),
                           ('account_balance_sheet_data.xml', build_balance_sheet),
                           ('account_profit_loss_data.xml', build_profit_loss)):
        open(os.path.join(DATA, fname), 'w', encoding='utf-8').write(builder().render())


# --------------------------------------------------------------------------------------
# 12. REFERENCES.md and the README "Research Documents" section
# --------------------------------------------------------------------------------------
REFERENCE_ROWS = [
    # item in module | what it implements | source keys
    ('data/template/account.tax-gh.csv - VAT 15% (components "Sales/Purchases/Import/Reverse Charge VAT 15%")',
     'VAT at 15%, calculated on the taxable value (Act 1151 s.3)', ['act1151', 'vat_page', 'guide1151']),
    ('data/template/account.tax-gh.csv - NHIL 2.5% and GETFund Levy 2.5% components',
     'Levies of 2.5% each on the same taxable value as VAT (no cascading); 20% in total', ['vat_page', 'vat_notice', 'guide1151']),
    ('Group taxes "Standard 20%", "Import of Goods 20%", "Import of Services - Reverse Charge 20%"',
     'NHIL and GETFund are recoverable as input tax; each charge on its own invoice line and tax group',
     ['vat_page', 'vat_notice', 'guide1151']),
    ('No COVID-19 Health Recovery Levy tax / no flat-rate tax',
     'COVID-19 Health Recovery Levy and VAT Flat Rate Scheme are abolished from 1 January 2026',
     ['vat_page', 'vat_notice', 'guide1151']),
    ('Taxes "Sales Zero-Rated 0%", "Purchases Zero-Rated 0%", "Sales Export 0%", "Sales Free Zone 0%"',
     'Zero-rated supplies (s.36, Second Schedule), exports, supplies to free zones with documentation',
     ['act1151', 'vat_page', 'guide1151']),
    ('Taxes "Sales Exempt", "Purchases Exempt"', 'Exempt supplies (s.35, First Schedule) and exempt imports (s.37)',
     ['act1151', 'exempt_page']),
    ('Import of Goods 20% tax; fiscal position "International"',
     'VAT collected at importation (s.34(1)(a)) and reclaimable as input tax', ['act1151', 'import_export_page', 'pwc_other']),
    ('Import of Services - Reverse Charge 20% tax; fiscal position "Imported Services (Reverse Charge)"',
     'Recipient accounts for VAT 15% + NHIL/GETFund 5% on imported services (s.34(1)(b), s.61; Guidelines s.10)',
     ['act1151', 'guide1151', 'vat_page']),
    ('Fiscal position "Free Zone Enterprise"',
     'Goods to free zones 0% with documentation; services to free zones remain standard rated (Guidelines s.14)',
     ['guide1151', 'act1151']),
    ('Fiscal position "Domestic (Ghana)" / "International"', 'Exports 0% (s.36); imports taxed at importation (s.34)',
     ['act1151', 'import_export_page']),
    ('Withholding tax purchase taxes "WHT Resident - ..." (goods 3%, works 5%, services 7.5%, rent 8% / 15%)',
     'Resident withholding rates; GH¢2,000 per annum threshold kept as documentation (goods, works, services only)',
     ['wht_page', 'wht_note', 'wht_codes', 'pwc_wht']),
    ('Withholding tax purchase taxes "WHT Non-resident - ..." (20% / 15% / 5%)', 'Non-resident withholding rate table',
     ['wht_page', 'wht_codes', 'pwc_wht']),
    ('Sales taxes "WHT Credit - ..." (inactive)', 'Tax withheld by customers is creditable to the withholdee',
     ['wht_note', 'wht_page']),
    ('data/account_vat_report_data.xml - VAT Return',
     'VAT / NHIL / GETFund return with output, input, non-deductible input (s.49-52), net payable, credit carry-over; '
     'layout cross-checked against the (pre-2026) GRA VAT return', ['act1151', 'vat_page', 'dt0135', 'guide1151']),
    ('data/account_wht_report_data.xml - Withholding Tax Report',
     'Payment base and tax withheld by category; remitted within 15 days after month end', ['wht_page', 'wht_note', 'wht_return']),
    ('data/res_country_state_data.xml', '16 regions of Ghana per ISO 3166-2:GH; GH-BA (Brong-Ahafo) deleted 2019-11-22',
     ['iso', 'wiki_iso']),
    ('data/account_balance_sheet_data.xml, data/account_profit_loss_data.xml',
     'IFRS-style presentation only (no legal source); structure follows Odoo Enterprise report definitions',
     ['src_ee_report']),
    ('data/template/account.account-gh.csv, account.tax.group-gh.csv, account.fiscal.position-gh.csv, models/template_gh.py, '
     '__manifest__.py', 'Odoo 20.0 localization file formats and template keys',
     ['odoo_doc', 'src_ke_manifest', 'src_ke_template', 'src_za_template', 'src_ke_csv', 'src_ng_fp', 'src_au_tax',
      'src_chart_template', 'src_ir_module', 'src_account_tax', 'src_partner', 'src_company', 'src_account_account',
      'src_generic_coa']),
    ('tax_report carry-over expressions', 'Odoo carryover mechanism (_carryover_* / _applied_carryover_*)',
     ['src_ke_report', 'src_ee_report']),
    ('Not implemented: VAT withholding by appointed agents (7%)', 'Documented only - see README', ['vat_wh_page', 'guide1151']),
    ('Source discovery (no module content)', 'Locating the Act 1151 / Act 896 PDFs, the VAT Guidelines and the VAT / WHT return forms',
     ['acts_page', 'practice_notes', 'forms_page']),
    ('Withholding tax rates (Income Tax Act, 2015, Act 896, First Schedule)',
     'Primary statute for the rates. NOT read (image-only PDF); the rates come from the GRA withholding tax page - see README',
     ['act896', 'wht_page']),
    ('Checked, no change: Income Tax (Amendment) Act 2026 (Act 1178)',
     'Changes personal income tax bands and the MTS threshold only; withholding rates unaffected', ['act1178']),
]


def md_escape(text):
    return text.replace('|', '\\|').replace('\n', ' ')


def build_references():
    lines = ['# REFERENCES - l10n_gh', '',
             'Every legal or factual claim in this module is tied to a document below. Date accessed for all documents: '
             '**%s**. CSV files cannot hold comments, so the CSV content is covered by this table; the XML files and the '
             'generator (`tools/generate_l10n_gh.py`) carry "Source:" comments in the code.' % sources.ACCESSED, '',
             '| Item in the module | What it implements | Official source (URL) | Date accessed |',
             '|---|---|---|---|']
    for item, what, keys in REFERENCE_ROWS:
        srcs = '<br>'.join('%s - %s' % (sources.BY_KEY[k]['title'], sources.BY_KEY[k]['url']) for k in keys)
        lines.append('| %s | %s | %s | %s |' % (md_escape(item), md_escape(what), md_escape(srcs), sources.ACCESSED))
    lines += ['', '## Source reliability notes', '']
    for s in sources.SOURCES:
        if s['status'] != 'Fetched and read' or s.get('note'):
            lines.append('- **%s** (%s) - %s%s' % (s['title'], s['url'], s['status'] + '. ' if s['status'] != 'Fetched and read' else '',
                                                 s.get('note', '')))
    lines += ['', '## Where sources disagree', '',
              '- **Services to an individual (resident)**: GRA WHT tax-code table 2015 says 15% (WRESSOSIOA); the current GRA '
              'withholding tax page says 7.5%. The GRA page is used (a single 7.5% services tax).',
              '- **Resident petroleum subcontractors**: 15% (2015 table) vs 7.5% (GRA page). Not modelled.',
              '- **Unprocessed precious minerals**: GRA page 3% vs PwC 1.5%. GRA wins; not modelled.',
              '- **VAT withholding page** still cites Act 870; the 2026 Guidelines (s.12.1) restate the same 7% rule under '
              'Act 1151. Not modelled.', '']
    return '\n'.join(lines)


def build_research_section():
    out = ['## Research Documents', '',
           'Every document opened or read while building this module (date accessed: %s). Items marked '
           '"Could not be opened" were **not** verified. The list matches `REFERENCES.md`.' % sources.ACCESSED, '']
    for group in sources.GROUPS:
        out += ['### %s' % group, '']
        out += ['| Title and publisher | URL / path | Date accessed | Type | Status | Used for |', '|---|---|---|---|---|---|']
        for s in sources.SOURCES:
            if s['group'] != group:
                continue
            used = s['used_for'] + (' **Note:** ' + s['note'] if s.get('note') else '')
            out.append('| %s - %s | %s | %s | %s | %s | %s |' % (
                md_escape(s['title']), md_escape(s['publisher']), s['url'], sources.ACCESSED, s['type'], s['status'],
                md_escape(used)))
        out.append('')
    return '\n'.join(out)


def main():
    for d in (DATA, TPL):
        os.makedirs(d, exist_ok=True)
    write_accounts()
    write_tax_groups()
    write_taxes()
    write_fiscal_positions()
    write_states()
    write_reports()
    open(os.path.join(MOD, 'REFERENCES.md'), 'w', encoding='utf-8').write(build_references())
    body = open(os.path.join(HERE, 'readme_body.md'), encoding='utf-8').read()
    open(os.path.join(MOD, 'README.md'), 'w', encoding='utf-8').write(
        body.replace('@@RESEARCH_DOCUMENTS@@', build_research_section()))
    print('generated l10n_gh data files')


if __name__ == '__main__':
    main()
