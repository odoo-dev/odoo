# Part of Odoo. See LICENSE file for full copyright and licensing details.
"""Single source of truth for every document read while building l10n_gh.

README.md ("Research Documents") and REFERENCES.md are both generated from this
list, and tools/validate_l10n_gh.py checks that every URL cited anywhere in the
module is listed here.

status values: 'Fetched and read' / 'Search result only (not opened)' /
'Could not be opened'.
"""

ACCESSED = '2026-10-28'

OFFICIAL = 'Official legal and tax sources'
ISO = 'ISO sources'
ODOO = 'Odoo source and documentation'
SECONDARY = 'Secondary sources'
GROUPS = [OFFICIAL, ISO, ODOO, SECONDARY]

GRA = 'Ghana Revenue Authority (GRA)'
ODOO_SRC = 'Odoo S.A. (odoo/odoo, 20.0)'

SOURCES = [
    # key, group, title, publisher, url, type, status, used_for, note
    dict(key='vat_page', group=OFFICIAL, publisher=GRA, title='VAT - Ghana Revenue Authority',
         url='https://gra.gov.gh/domestic-tax/tax-types/vat/', type='Official', status='Fetched and read',
         used_for='VAT 15% + NHIL 2.5% + GETFund 2.5% on the same taxable value (20% total), COVID-19 levy abolished, '
                  'flat rate scheme removed, zero-rated list (sanitary towels, textiles), levies follow VAT '
                  'zero-rating/exemption, NHIL/GETFund claimable as input tax, imported services, filing deadline',
         note='Fetched through the web-fetch tool, which returns a model-written digest of the page rather than raw HTML.'),
    dict(key='vat_notice', group=OFFICIAL, publisher=GRA, title='Notice to all VAT registered taxpayers',
         url='https://gra.gov.gh/news/portfolio/notice-to-all-vat-registered-taxpayers/', type='Official',
         status='Fetched and read',
         used_for='Act 1151 effective 1 January 2026, goods threshold GH¢750,000, NHIL/GETFund input credit, '
                  'VAT Flat Rate Scheme and COVID-19 Health Recovery Levy abolished',
         note='The page shows no publication date. Fetched through the web-fetch tool (digest).'),
    dict(key='wht_page', group=OFFICIAL, publisher=GRA, title='Withholding Tax - Ghana Revenue Authority',
         url='https://gra.gov.gh/portfolio/withholding-tax/', type='Official', status='Fetched and read',
         used_for='WHT resident and non-resident rate tables, GH¢2,000 per annum threshold (goods, works, services only), '
                  'filing deadline (15 days after month end)',
         note='Fetched through the web-fetch tool (digest). The page wins where other sources disagree.'),
    dict(key='vat_wh_page', group=OFFICIAL, publisher=GRA, title='VAT Withholding - Ghana Revenue Authority',
         url='https://gra.gov.gh/domestic-tax/tax-types/vat-withholding/', type='Official', status='Fetched and read',
         used_for='VAT withholding by appointed agents (7%) - documented as NOT implemented',
         note='Page still cites Act 870; the 2026 Guidelines (section 12.1) restate the 7% rule under Act 1151.'),
    dict(key='wht_note', group=OFFICIAL, publisher=GRA,
         title='Practice Note on Withholding of Tax under the Income Tax Act, 2015 (Act 896), DT/2016/001, issued 6 October 2016',
         url='https://gra.gov.gh/wp-content/uploads/2020/09/Practice-Note-on-Withholding-of-Tax.pdf', type='Official',
         status='Fetched and read',
         used_for='GH¢2,000 threshold and aggregation of contracts (4.6), WHT computed on amount excluding VAT/NHIL, '
                  'remittance within 15 days, tax credit for the withholdee (8.0)',
         note='Downloaded and text-extracted with pdftotext. Issued in 2016, so rates in it are not used.'),
    dict(key='wht_codes', group=OFFICIAL, publisher=GRA,
         title='Withholding Tax Table - Residency, Tax Codes, Rate and Description (2015)',
         url='https://gra.gov.gh/wp-content/uploads/2020/09/WHT-TAX-CODES_DESCRIPTION-AND-RATES_2015.pdf',
         type='Official', status='Fetched and read',
         used_for='Cross-check of WHT codes and rates (WRESSUGEOA, WRESSWOA, WRESSSOIOA, WRESRPRPOA, WRESRPNRPOA, WNON*)',
         note='Older than the web page. Disagrees with the page on: services to an individual (15% here, 7.5% on the page) '
              'and resident petroleum subcontractors (15% here, 7.5% on the page). The page wins; neither row is modelled '
              'separately (individual services share the 7.5% services tax).'),
    dict(key='acts_page', group=OFFICIAL, publisher=GRA, title='Acts - Ghana Revenue Authority',
         url='https://gra.gov.gh/acts/', type='Official', status='Fetched and read',
         used_for='Locating the Act 1151 and Act 896 PDFs and the 2026 income tax amendment notice'),
    dict(key='act1151', group=OFFICIAL, publisher='Parliament of Ghana (published by GRA)',
         title='Value Added Tax Act, 2025 (Act 1151)',
         url='https://gra.gov.gh/wp-content/uploads/2026/01/VALUE-ADDED-TAX-ACT-2025-ACT-1151.pdf', type='Official',
         status='Fetched and read',
         used_for='Section 3 (VAT 15%), s.34 (tax on imports of goods/services), s.35 and First Schedule (exempt), s.36 and Second '
                  'Schedule (zero-rated: para 2(1) exports, 2(6) goods to free zones, 2(10) textiles to 31 Dec 2028, 2(11) '
                  'sanitary towels, para 3 services), s.37 (exempt imports), s.38 and Third Schedule (relief supplies - not '
                  'modelled), s.44 (taxable value excludes VAT/NHIL/GETFund), s.49-52 (deductible input tax), s.61 (import '
                  'of services, payable within 21 days)',
         note='Image-only PDF (87 pages): read through OCR, which is imperfect. Section numbers cited are as OCR-read.'),
    dict(key='guide1151', group=OFFICIAL, publisher=GRA,
         title='VAT Administrative Guidelines for the Value Added Tax Act, 2025 (Act 1151), GRA/AG/25/002, 31 December 2025',
         url='https://gra.gov.gh/wp-content/uploads/2026/01/VAT-Guidelines-for-VAT-ACT-1151.pdf', type='Official',
         status='Fetched and read',
         used_for='Rate 15% with NHIL/GETFund 2.5% each on the same taxable value (s.5-6, 15.3), import of services '
                  'computation (s.10), VAT withholding 7% (s.12.1), services to free zone taxable at standard rate (s.14), '
                  'tax-fraction 1/8, 1/48, 1/48 for tax-inclusive prices, no registration threshold for service providers (s.7.1)',
         note='Image-only PDF (22 pages): read through OCR, which is imperfect.'),
    dict(key='practice_notes', group=OFFICIAL, publisher=GRA, title='Practice Notes and Guidelines - Ghana Revenue Authority',
         url='https://gra.gov.gh/practice-notes/', type='Official', status='Fetched and read',
         used_for='Locating the Act 1151 Guidelines and the withholding practice note'),
    dict(key='forms_page', group=OFFICIAL, publisher=GRA, title='Forms - Ghana Revenue Authority',
         url='https://gra.gov.gh/forms/', type='Official', status='Fetched and read',
         used_for='Locating VAT and WHT return forms. Only pre-2026 VAT forms (with COVID-19 levy / flat rate) are listed; '
                  'no Act 1151 return form was found'),
    dict(key='dt0135', group=OFFICIAL, publisher=GRA, title='DT 0135 Monthly Standard VAT Return (Ver 1.5)',
         url='https://gra.gov.gh/wp-content/uploads/2021/06/DT-0135-VAT-NHIL-COVID-19-Standard-Rate-Return-Form-20082018-Ver1.5.pdf',
         type='Official', status='Fetched and read',
         used_for='Layout check of the VAT return (taxable outputs, zero-rated, relief, exempt, local input, imports, '
                  'credit brought forward). Obsolete for rates (COVID-19 levy, flat rate)'),
    dict(key='wht_return', group=OFFICIAL, publisher=GRA, title='DT 110 Withholding Tax Return (v1.2, 2020)',
         url='https://gra.gov.gh/wp-content/uploads/2022/02/withholding_tax_return_form_v1_2_2020-.xlsx', type='Official',
         status='Fetched and read',
         used_for='Layout check of the Withholding Tax Report (gross amount of payment, WHT type, rate, tax withheld)',
         note='Spreadsheet strings were read; formulas/validation lists were not analysed.'),
    dict(key='act1178', group=OFFICIAL, publisher=GRA,
         title='Amendments - Income Tax Act, 2026 (Act 1178) (GRA notice)',
         url='https://gra.gov.gh/wp-content/uploads/2026/09/Amendments-To-The-Income-Tax-2015-Act-896_Updated-1.pdf',
         type='Official', status='Fetched and read',
         used_for='Checked that the 1 September 2026 income tax amendment changes personal income tax bands and the MTS '
                  'threshold only, not the withholding tax rates modelled here'),
    dict(key='import_export_page', group=OFFICIAL, publisher=GRA, title='VAT on Imports and Exports - Ghana Revenue Authority',
         url='https://gra.gov.gh/domestic-tax/tax-types/vat-on-imports-and-exports/', type='Official',
         status='Fetched and read',
         used_for='Import VAT is charged at importation and reclaimable as input tax by registered importers',
         note='Cites Act 1151 ss.35-37 and 50 for exports but does not state their content.'),
    dict(key='exempt_page', group=OFFICIAL, publisher=GRA, title='VAT Exemptions - Ghana Revenue Authority',
         url='https://gra.gov.gh/domestic-tax/tax-types/vat-exemptions/', type='Official', status='Fetched and read',
         used_for='Exempt supplies list (documentation only). Page cites Act 870 for the list'),
    dict(key='act896', group=OFFICIAL, publisher='Parliament of Ghana (published by GRA)',
         title='Income Tax Act, 2015 (Act 896)',
         url='https://gra.gov.gh/wp-content/uploads/2020/09/INCOME-TAX-ACT-2015-ACT-896.pdf', type='Official',
         status='Could not be opened',
         used_for='Intended source for the First Schedule withholding rates. NOT used: the 182-page PDF is image-only and was '
                  'not OCR-read. No rate in the module cites it; rates come from the GRA withholding tax page',
         note='Downloaded (HTTP 200) but not readable as text.'),
    dict(key='iso', group=ISO, publisher='International Organization for Standardization',
         title='ISO 3166-2:GH - Online Browsing Platform',
         url='https://www.iso.org/obp/ui/#iso:code:3166:GH', type='Official', status='Could not be opened',
         used_for='Authority for the region codes. The page returned HTTP 403, so the codes were cross-checked against '
                  'Wikipedia only',
         note='Not verified against the ISO platform.'),
    dict(key='wiki_iso', group=ISO, publisher='Wikipedia', title='ISO 3166-2:GH',
         url='https://en.wikipedia.org/wiki/ISO_3166-2:GH', type='Secondary', status='Fetched and read',
         used_for='16 current region codes and names; GH-BA (Brong-Ahafo) deleted 2019-11-22',
         note='Secondary cross-check only. Agrees with the code list given in the build brief.'),
    dict(key='odoo_doc', group=ODOO, publisher='Odoo S.A.', title='Accounting localization (Odoo 20.0 developer documentation)',
         url='https://www.odoo.com/documentation/latest/developer/howtos/accounting_localization.html', type='Official',
         status='Fetched and read',
         used_for='Module structure overview',
         note='The fetch tool returned only the table of contents (the body was truncated), so the Odoo 20.0 source code '
              'below was used as the real reference.'),
    dict(key='src_ke_manifest', group=ODOO, publisher=ODOO_SRC, title='addons/l10n_ke/__manifest__.py',
         url='addons/l10n_ke/__manifest__.py', type='Official', status='Fetched and read',
         used_for='Manifest keys (countries, auto_install, data/demo layout)'),
    dict(key='src_ke_template', group=ODOO, publisher=ODOO_SRC, title='addons/l10n_ke/models/template_ke.py',
         url='addons/l10n_ke/models/template_ke.py', type='Official', status='Fetched and read',
         used_for='@template data keys: code_digits, res.company fields, account.account stock variation'),
    dict(key='src_za_template', group=ODOO, publisher=ODOO_SRC, title='addons/l10n_za/models/template_za.py and __manifest__.py',
         url='addons/l10n_za/models/template_za.py', type='Official', status='Fetched and read',
         used_for='Second template reference'),
    dict(key='src_ke_csv', group=ODOO, publisher=ODOO_SRC,
         title='addons/l10n_ke/data/template/account.{account,tax,tax.group,fiscal.position}-ke.csv',
         url='addons/l10n_ke/data/template/account.tax-ke.csv', type='Official', status='Fetched and read',
         used_for='CSV columns for accounts, taxes (repartition lines, fiscal_position_ids, original_tax_ids), tax groups, '
                  'fiscal positions'),
    dict(key='src_ng_fp', group=ODOO, publisher=ODOO_SRC, title='addons/l10n_ng/data/template/account.fiscal.position-ng.csv',
         url='addons/l10n_ng/data/template/account.fiscal.position-ng.csv', type='Official', status='Fetched and read',
         used_for='Fiscal position CSV columns'),
    dict(key='src_au_tax', group=ODOO, publisher=ODOO_SRC, title='addons/l10n_au/data/template/account.tax-au.csv',
         url='addons/l10n_au/data/template/account.tax-au.csv', type='Official', status='Fetched and read',
         used_for='Group taxes (amount_type group, children_tax_ids) and tax_scope'),
    dict(key='src_ke_report', group=ODOO, publisher=ODOO_SRC, title='addons/l10n_ke/data/account_tax_report_data.xml',
         url='addons/l10n_ke/data/account_tax_report_data.xml', type='Official', status='Fetched and read',
         used_for='account.report XML under account.generic_tax_report: tax_tags formulas, editable external lines, '
                  '_carryover_* / _applied_carryover_* expressions'),
    dict(key='src_in_states', group=ODOO, publisher=ODOO_SRC, title='addons/l10n_in/data/res_country_state_data.xml',
         url='addons/l10n_in/data/res_country_state_data.xml', type='Official', status='Fetched and read',
         used_for='res.country.state XML pattern'),
    dict(key='src_chart_template', group=ODOO, publisher=ODOO_SRC, title='addons/account/models/chart_template.py',
         url='addons/account/models/chart_template.py', type='Official', status='Fetched and read',
         used_for='Tag mapper (tag names are unsigned, report formula sign is separate), TAX_TAG_DELIMITER, template loading'),
    dict(key='src_ir_module', group=ODOO, publisher=ODOO_SRC, title='addons/account/models/ir_module.py',
         url='addons/account/models/ir_module.py', type='Official', status='Fetched and read',
         used_for='How templates are discovered (models/template_*.py, @template)'),
    dict(key='src_account_tax', group=ODOO, publisher=ODOO_SRC, title='addons/account/models/account_tax.py',
         url='addons/account/models/account_tax.py', type='Official', status='Fetched and read',
         used_for='account.tax fields (fiscal_position_ids, original_tax_ids, tax_scope, group children constraint)'),
    dict(key='src_partner', group=ODOO, publisher=ODOO_SRC, title='addons/account/models/partner.py (account.fiscal.position)',
         url='addons/account/models/partner.py', type='Official', status='Fetched and read',
         used_for='Fiscal position tax mapping semantics (map_tax)'),
    dict(key='src_company', group=ODOO, publisher=ODOO_SRC, title='addons/account/models/company.py',
         url='addons/account/models/company.py', type='Official', status='Fetched and read',
         used_for='res.company account fields, domestic fiscal position computation'),
    dict(key='src_account_account', group=ODOO, publisher=ODOO_SRC, title='addons/account/models/account_account.py',
         url='addons/account/models/account_account.py', type='Official', status='Fetched and read',
         used_for='Valid account_type values in 20.0'),
    dict(key='src_generic_coa', group=ODOO, publisher=ODOO_SRC, title='addons/account/models/template_generic_coa.py',
         url='addons/account/models/template_generic_coa.py', type='Official', status='Fetched and read',
         used_for='Company default account keys set by a chart template'),
    dict(key='src_ee_report', group=ODOO, publisher='Odoo S.A. (odoo/enterprise, 20.0)',
         title='account_reports/models/account_report.py and data/balance_sheet.xml, profit_and_loss.xml',
         url='enterprise/account_reports/data/balance_sheet.xml', type='Official', status='Fetched and read',
         used_for='Carryover mechanics (if_below), balance sheet / P&L line structure and current-year earnings domain'),
    dict(key='pwc_wht', group=SECONDARY, publisher='PwC Worldwide Tax Summaries',
         title='Ghana - Corporate - Withholding taxes',
         url='https://taxsummaries.pwc.com/ghana/corporate/withholding-taxes', type='Secondary', status='Fetched and read',
         used_for='Cross-check only of the GRA withholding rates',
         note='Agrees with the GRA page for every rate modelled. Disagrees on unprocessed precious minerals (1.5% vs GRA 3%) '
              'and lists extra rows (realisation of assets) absent from the GRA page; neither is modelled.'),
    dict(key='pwc_other', group=SECONDARY, publisher='PwC Worldwide Tax Summaries', title='Ghana - Corporate - Other taxes',
         url='https://taxsummaries.pwc.com/ghana/corporate/other-taxes', type='Secondary', status='Fetched and read',
         used_for='Cross-check only: VAT 15%, NHIL 2.5%, GETFund 2.5%, levies on imports of goods and imported services',
         note='Does not mention the threshold, flat rate scheme or COVID-19 levy, so nothing was taken from it.'),
]

BY_KEY = {s['key']: s for s in SOURCES}

# Short reference used in source comments: key -> label printed in generated files
def cite(*keys):
    return '; '.join('%s <%s>' % (BY_KEY[k]['title'], BY_KEY[k]['url']) for k in keys)
