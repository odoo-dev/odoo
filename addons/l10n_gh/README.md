# Ghana - Accounting (`l10n_gh`)

Fiscal localization for Ghana, built for **Odoo 20.0** (`depends: account`, `auto_install: account`, LGPL-3).
It reflects the **Value Added Tax Act, 2025 (Act 1151), effective 1 January 2026**. It is a baseline, not a
GRA-certified product: read "Unverified / needs review" before using it to file returns.

Every legal claim is tied to an official document in [REFERENCES.md](REFERENCES.md); the full list of documents
read (including those that could not be opened) is the "Research Documents" section below.

## 1. Contents

| Area | What is in the module |
|---|---|
| Chart of accounts (English, `code_digits: 6`, IFRS-oriented) | 119 accounts: PPE and accumulated depreciation, intangibles, investments, deferred tax, inventory + stock interim, receivables, tax control accounts (VAT, NHIL, GETFund, withholding tax resident / non-resident, corporate income tax, PAYE, SSNIT, Tier 2/3 pension), payables, loans, IFRS 16 lease liabilities and right-of-use assets, equity (Stated Capital, Income Surplus, Current Year Earnings), income, cost of sales, operating expenses, depreciation, finance costs, FX gain/loss, income tax expense. Investing/financing cash-flow tags where appropriate. |
| Company defaults (`models/template_gh.py`) | receivable/payable, bank/cash/transfer prefixes (1310 / 1320 / 1330), FX, cash-difference, early-payment-discount, default income/expense, PoS receivable, stock valuation (+ expense and variation accounts), default sale/purchase tax = the 20% group taxes. |
| Taxes (36) | See section 2. |
| Tax groups (7) | VAT 15%, NHIL 2.5%, GETFund Levy 2.5%, VAT + NHIL + GETFund (20%), VAT 0%, VAT Exempt, Withholding Tax. |
| Fiscal positions (4) | Domestic (Ghana, seq 1, auto, country GH) / International (Exports and Imports, seq 2, auto) / Free Zone Enterprise (manual) / Imported Services (Reverse Charge) (manual). |
| Tax reports | **VAT Return** (`account.generic_tax_report` variant for `base.gh`; columns Taxable Value / VAT / NHIL / GETFund Levy; output tax, input tax, editable non-deductible input tax, net payable, per-column credit carry-over via `_carryover_*` / `_applied_carryover_*`) and **Withholding Tax Report** (payment base and tax withheld by category; plus a section for WHT credits). |
| Financial reports | Balance Sheet (Statement of Financial Position) and Profit and Loss, IFRS-style, by account code. |
| States | The 16 regions of ISO 3166-2:GH (`state_gh_af` ... `state_gh_wn`). GH-BA (Brong-Ahafo, deleted 2019-11-22) is not created. No Ghana state exists in `base`. |
| Demo | `GH Company`, Accra, GHS, chart loaded with `try_loading`. |
| Tests | `tests/test_gh_taxes.py` (9 tests: defaults, 20% without cascade, credit note, tax-included fractions, export / free zone, import of goods, reverse charge netting to zero, WHT rates, regions). |
| Tooling | `tools/generate_l10n_gh.py` (writes every CSV/XML data file, REFERENCES.md and this README), `tools/validate_l10n_gh.py`, `tools/sources.py` (single list of documents behind README and REFERENCES). |

## 2. Taxes

All three charges are computed on the **same taxable value** (no cascading): Act 1151 s.3 (VAT 15%), GRA VAT page,
GRA notice and GRA Guidelines s.5-6 and 15.3 (NHIL 2.5% + GETFund 2.5%; 20% in total). The COVID-19 Health Recovery
Levy and the VAT Flat Rate Scheme are abolished and therefore not modelled. NHIL and GETFund are recoverable as input tax.

| Tax (type) | Implementation |
|---|---|
| *Sales Standard 20%* (sale), *Purchases Standard 20%* (purchase) | Group tax of three component taxes (VAT 15% / NHIL 2.5% / GETFund 2.5%). Each levy has its own tax group, repartition line, account, and report tag, so each appears on its own invoice line and in its own tax-group total. The base is tagged once (on the VAT component). |
| *Import of Goods 20%* (purchase) | Same three components with import tags; replaces *Purchases Standard 20%* in the International fiscal position. |
| *Import of Services - Reverse Charge 20%* (purchase) | Three components, each with a `+100%` line to the input account and a `-100%` line to the output account (they net to zero); used by the *Imported Services (Reverse Charge)* fiscal position. |
| *Sales/Purchases Zero-Rated 0%*, *Sales Export 0%*, *Sales Free Zone 0%*, *Sales/Purchases Exempt* | Each with its own base tag. Basis: Act 1151 s.35-36 and the First/Second Schedules (exports para 2(1), goods to free zone developers/enterprises para 2(6), locally manufactured sanitary towels and textiles). |
| *WHT Resident*: goods 3%, works 5%, services 7.5%, rent residential 8%, rent non-residential 15% | Purchase taxes with negative amounts to *Withholding Tax Payable - Resident*. Rates from the GRA withholding tax page; code cross-check with the GRA 2015 table. |
| *WHT Non-resident*: management and technical fees 20%, goods/works/any services 20%, royalties/natural resources/rents 15%, telecom and transport 15%, petroleum subcontractors 15%, general insurance premiums 5% | Purchase taxes to *Withholding Tax Payable - Non-resident*. |
| *WHT Credit*: goods 3%, works 5%, services 7.5% (sale, **inactive**) | Tax withheld by our customers, debited to *Withholding Tax Receivable*. |

**GH¢2,000 threshold.** The GRA page applies it to goods, works and services only, per annum, aggregated per
same goods/works/services (Practice Note DT/2016/001 s.4.6). Odoo taxes cannot apply a threshold, so it is kept as
documentation in the tax description; users must not select these taxes for payments below it.

**Fiscal position mapping.** In Odoo 20.0 a tax with `fiscal_position_ids` set is *removed* by any other fiscal
position that does not map it. Therefore the local VAT taxes belong to *Domestic*; *International* maps all sales taxes
to *Sales Export 0%* and *Purchases Standard 20%* to *Import of Goods 20%*; *Free Zone Enterprise* maps all sales taxes to
*Sales Free Zone 0%*; *Imported Services* maps *Purchases Standard 20%* to the reverse charge. Zero-rated and exempt
purchase taxes stay available in all of them. Withholding taxes are not tied to any fiscal position.

## 3. Deviations from the build brief (and why)

1. **The three component taxes are ACTIVE, not inactive.** The brief asked for inactive components. On this Odoo 20.0
   source an active group tax ignores archived children: a posted 1,000 sale produced no VAT/NHIL/GETFund lines
   (`group.flatten_taxes_hierarchy()` returned `[]`). Core localizations only ship inactive children inside *inactive*
   groups (l10n_in). The components are therefore active; their description tells users to select the group tax. The
   validator rejects an active group with an inactive child.
2. **A fourth fiscal position, *Imported Services (Reverse Charge)*.** Odoo 20.0 `map_tax` maps a tax to *all* its
   replacements, it does not filter on `tax_scope`, so one position cannot map the same purchase tax to both import VAT
   (goods) and reverse charge (services). *International* (auto) handles goods; the manual fourth position handles
   services.
3. **Free Zone Enterprise is for supplies of goods.** Act 1151 Second Schedule para 2(6) zero-rates goods to free zone
   developers/enterprises; GRA Guidelines s.14 say *services* to them are taxable at the standard rate. The position
   maps all sales to 0%, as the brief asked, so it must not be used for services.
4. **Balance Sheet and Profit and Loss are stand-alone reports** (no `root_report_id`), because the Enterprise roots
   (`account_reports.balance_sheet`) do not exist in Community and the module depends on `account` only. In Enterprise they
   appear as separate "Balance Sheet (Statement of Financial Position)" / "Profit and Loss (Statement of Profit or Loss)"
   entries for Ghana.
5. **Odoo source = local checkout.** `/home/odoo/odoo/community` (not a git repository; `odoo/release.py` reports
   `version_info = (20, 0, 0, FINAL, 0)`) was used instead of a fresh clone of branch 20.0.

## 4. Deliberately NOT included

* Payroll: PAYE calculation, SSNIT (only control accounts exist), Tier 2/3 pension calculation.
* E-VAT / certified invoicing system integration (e-invoicing).
* Communication Service Tax, Tourism Levy, Excise (Guidelines s.15.3 add CST/excise to the taxable value; not modelled).
* Growth and Sustainability Levy calculation.
* **VAT withholding by appointed agents (7% of taxable value, GRA VAT withholding page and Guidelines s.12.1)** - needs
  agent designation, a withholding VAT certificate and a withholding VAT return; it cannot be implemented correctly with
  plain taxes, so it is skipped.
* Relief supplies (Third Schedule), upfront payment by unregistered importers (Guidelines s.9), automatic VAT collection on
  digital services (VACS, Guidelines s.11), the import-of-services declaration (s.61: payable within 21 days).
* Withholding rows that are not supplier payments or are not in the brief: dividends, interest, directors' fees,
  commissions, lotto, endorsement/teaching fees, petroleum subcontractors (resident), unprocessed precious minerals,
  royalties paid to residents, branch profits.
* Itemised First Schedule (exempt) or Second Schedule (zero-rated) goods lists: users choose the tax per product.
* Registration thresholds (GH¢750,000 for goods; none for service providers) and filing deadlines.
* Translations (English only).

## 5. Unverified / needs review

1. **ISO 3166-2:GH**: the iso.org page returned HTTP 403 and could not be opened. The 16 codes/names were cross-checked on
   Wikipedia only (secondary).
2. **Act 1151 and the Guidelines were read through OCR** (both PDFs are image-only). Section numbers and wording quoted in
   this module may contain OCR errors. Act 1151 s.3 states only the 15% VAT rate; the 2.5% NHIL and 2.5% GETFund Levy rates
   come from the GRA VAT page, the GRA notice and the Guidelines, not from the Act text. The levy statutes themselves were not opened.
3. **Income Tax Act, 2015 (Act 896) was not read** (182-page image-only PDF). Withholding rates come from the GRA withholding tax
   page (read through the fetch tool's digest), cross-checked against the 2015 GRA code table and PwC (secondary).
   The Practice Note (DT/2016/001) dates from 2016.
4. **Source disagreements**: individual services 15% (GRA 2015 table) vs 7.5% (GRA page, used); resident petroleum
   subcontractors 15% vs 7.5% (not modelled); unprocessed precious minerals 3% (GRA) vs 1.5% (PwC, not modelled). The
   GRA VAT page and the Guidelines word the filing deadline differently ("last working day" vs "last day" of the following month).
5. **NHIL and GETFund on imports of goods**: confirmed in an official source for imported *services* (Guidelines s.10;
   GRA VAT page) but for imported *goods* only by PwC (secondary) and the GRA statement that the levies are claimable as input tax. Review before relying
   on the *Import of Goods 20%* tax.
6. **Reverse charge**: Guidelines s.10 treat imported services used to make *taxable* supplies as outside the
   import-of-services charge (the charge applies to the exempt/non-taxable use). The +100%/-100% tax is provided as requested;
   decide per transaction whether the charge applies.
7. **VAT Return layout**: no Act 1151 return form was found on the GRA forms page (only pre-2026 forms with the COVID-19 levy and
   flat-rate boxes). The four-column layout follows the build brief. Credit carry-over is kept **per column** (VAT, NHIL, GETFund
   separately); whether GRA allows netting between levies was not found. "Non-deductible input tax" is a manual entry
   (Act 1151 s.50-52 restrict vehicles, entertainment, clubs and mixed supplies; no automatic apportionment).
8. **WHT credits on sales** are recognised at invoice time, not cash basis, and are inactive by default.
9. **Stock interim accounts** are typed `asset_current` like l10n_ke; under IFRS "received not invoiced" is normally a liability.
10. Demo company details (street, phone, e-mail) are placeholders.

## 6. Validation and testing (what was actually run, 2026-10-28)

* `python3 l10n_gh/tools/validate_l10n_gh.py` - passes. It checks: XML parses, Python compiles, manifest dict; unique XML ids and
  account codes; every referenced account / tax group / fiscal position / original tax / child tax exists; `account_type` values
  against the Odoo 20.0 selection read from source; invoice/refund repartition lines match (count, order, factor, tag, account) with
  exactly one base line; reverse-charge lines net to zero; tax tags used by the CSV <-> `tax_tags` formulas in the reports (both
  directions); aggregation formulas point to existing line codes and labels; exactly 16 Ghana states, ISO codes, no GH-BA;
  every URL in REFERENCES.md is in the Research Documents list below and vice versa. The validator was itself tested by
  injecting 13 defects into a copy of the module; all 13 were reported.
* Installed with Odoo 20.0 Community on PostgreSQL 18 (fresh databases): (a) `-i l10n_gh --with-demo`: no ERROR/CRITICAL,
  demo company loaded the chart; (b) `db init --country gh` + `-i account`: `l10n_gh` auto-installed, chart auto-loaded on the
  main company, no demo data; (c) `-u l10n_gh` on an installed database; (d) `--test-tags /l10n_gh`: 9 module tests, 0 failed.
* Behaviour checked on posted documents: 1,000 sale = 150 + 25 + 25 on separate lines/groups (total 1,200); credit note mirrors;
  tax-included 1,200 gives base 1,000; Nigerian customer picks *International* and *Sales Export 0%*; US vendor picks
  *Import of Goods 20%*; reverse charge nets to zero; WHT 3% on 10,000 = 300 and appears in the report.
* **Test aid only:** the Enterprise `account_reports` module was installed in a scratch database (not a dependency of this module) to compute
  the reports. The VAT Return, Withholding Tax Report, Balance Sheet (balances) and P&L computed with the expected figures, and a
  credit carried forward from October appeared as "credit brought forward" in November for VAT, NHIL and GETFund.

**Not tested:** PDF/print layouts, translations, multi-company, PoS, stock valuation flows, VAT closing entries and
Enterprise return/submission workflows, upgrades from an earlier version, Odoo.sh/runbot. The iso.org page could not be checked.

## Research Documents

Every document opened or read while building this module (date accessed: 2026-10-28). Items marked "Could not be opened" were **not** verified. The list matches `REFERENCES.md`.

### Official legal and tax sources

| Title and publisher | URL / path | Date accessed | Type | Status | Used for |
|---|---|---|---|---|---|
| VAT - Ghana Revenue Authority - Ghana Revenue Authority (GRA) | https://gra.gov.gh/domestic-tax/tax-types/vat/ | 2026-10-28 | Official | Fetched and read | VAT 15% + NHIL 2.5% + GETFund 2.5% on the same taxable value (20% total), COVID-19 levy abolished, flat rate scheme removed, zero-rated list (sanitary towels, textiles), levies follow VAT zero-rating/exemption, NHIL/GETFund claimable as input tax, imported services, filing deadline **Note:** Fetched through the web-fetch tool, which returns a model-written digest of the page rather than raw HTML. |
| Notice to all VAT registered taxpayers - Ghana Revenue Authority (GRA) | https://gra.gov.gh/news/portfolio/notice-to-all-vat-registered-taxpayers/ | 2026-10-28 | Official | Fetched and read | Act 1151 effective 1 January 2026, goods threshold GH¢750,000, NHIL/GETFund input credit, VAT Flat Rate Scheme and COVID-19 Health Recovery Levy abolished **Note:** The page shows no publication date. Fetched through the web-fetch tool (digest). |
| Withholding Tax - Ghana Revenue Authority - Ghana Revenue Authority (GRA) | https://gra.gov.gh/portfolio/withholding-tax/ | 2026-10-28 | Official | Fetched and read | WHT resident and non-resident rate tables, GH¢2,000 per annum threshold (goods, works, services only), filing deadline (15 days after month end) **Note:** Fetched through the web-fetch tool (digest). The page wins where other sources disagree. |
| VAT Withholding - Ghana Revenue Authority - Ghana Revenue Authority (GRA) | https://gra.gov.gh/domestic-tax/tax-types/vat-withholding/ | 2026-10-28 | Official | Fetched and read | VAT withholding by appointed agents (7%) - documented as NOT implemented **Note:** Page still cites Act 870; the 2026 Guidelines (section 12.1) restate the 7% rule under Act 1151. |
| Practice Note on Withholding of Tax under the Income Tax Act, 2015 (Act 896), DT/2016/001, issued 6 October 2016 - Ghana Revenue Authority (GRA) | https://gra.gov.gh/wp-content/uploads/2020/09/Practice-Note-on-Withholding-of-Tax.pdf | 2026-10-28 | Official | Fetched and read | GH¢2,000 threshold and aggregation of contracts (4.6), WHT computed on amount excluding VAT/NHIL, remittance within 15 days, tax credit for the withholdee (8.0) **Note:** Downloaded and text-extracted with pdftotext. Issued in 2016, so rates in it are not used. |
| Withholding Tax Table - Residency, Tax Codes, Rate and Description (2015) - Ghana Revenue Authority (GRA) | https://gra.gov.gh/wp-content/uploads/2020/09/WHT-TAX-CODES_DESCRIPTION-AND-RATES_2015.pdf | 2026-10-28 | Official | Fetched and read | Cross-check of WHT codes and rates (WRESSUGEOA, WRESSWOA, WRESSSOIOA, WRESRPRPOA, WRESRPNRPOA, WNON*) **Note:** Older than the web page. Disagrees with the page on: services to an individual (15% here, 7.5% on the page) and resident petroleum subcontractors (15% here, 7.5% on the page). The page wins; neither row is modelled separately (individual services share the 7.5% services tax). |
| Acts - Ghana Revenue Authority - Ghana Revenue Authority (GRA) | https://gra.gov.gh/acts/ | 2026-10-28 | Official | Fetched and read | Locating the Act 1151 and Act 896 PDFs and the 2026 income tax amendment notice |
| Value Added Tax Act, 2025 (Act 1151) - Parliament of Ghana (published by GRA) | https://gra.gov.gh/wp-content/uploads/2026/01/VALUE-ADDED-TAX-ACT-2025-ACT-1151.pdf | 2026-10-28 | Official | Fetched and read | Section 3 (VAT 15%), s.34 (tax on imports of goods/services), s.35 and First Schedule (exempt), s.36 and Second Schedule (zero-rated: para 2(1) exports, 2(6) goods to free zones, 2(10) textiles to 31 Dec 2028, 2(11) sanitary towels, para 3 services), s.37 (exempt imports), s.38 and Third Schedule (relief supplies - not modelled), s.44 (taxable value excludes VAT/NHIL/GETFund), s.49-52 (deductible input tax), s.61 (import of services, payable within 21 days) **Note:** Image-only PDF (87 pages): read through OCR, which is imperfect. Section numbers cited are as OCR-read. |
| VAT Administrative Guidelines for the Value Added Tax Act, 2025 (Act 1151), GRA/AG/25/002, 31 December 2025 - Ghana Revenue Authority (GRA) | https://gra.gov.gh/wp-content/uploads/2026/01/VAT-Guidelines-for-VAT-ACT-1151.pdf | 2026-10-28 | Official | Fetched and read | Rate 15% with NHIL/GETFund 2.5% each on the same taxable value (s.5-6, 15.3), import of services computation (s.10), VAT withholding 7% (s.12.1), services to free zone taxable at standard rate (s.14), tax-fraction 1/8, 1/48, 1/48 for tax-inclusive prices, no registration threshold for service providers (s.7.1) **Note:** Image-only PDF (22 pages): read through OCR, which is imperfect. |
| Practice Notes and Guidelines - Ghana Revenue Authority - Ghana Revenue Authority (GRA) | https://gra.gov.gh/practice-notes/ | 2026-10-28 | Official | Fetched and read | Locating the Act 1151 Guidelines and the withholding practice note |
| Forms - Ghana Revenue Authority - Ghana Revenue Authority (GRA) | https://gra.gov.gh/forms/ | 2026-10-28 | Official | Fetched and read | Locating VAT and WHT return forms. Only pre-2026 VAT forms (with COVID-19 levy / flat rate) are listed; no Act 1151 return form was found |
| DT 0135 Monthly Standard VAT Return (Ver 1.5) - Ghana Revenue Authority (GRA) | https://gra.gov.gh/wp-content/uploads/2021/06/DT-0135-VAT-NHIL-COVID-19-Standard-Rate-Return-Form-20082018-Ver1.5.pdf | 2026-10-28 | Official | Fetched and read | Layout check of the VAT return (taxable outputs, zero-rated, relief, exempt, local input, imports, credit brought forward). Obsolete for rates (COVID-19 levy, flat rate) |
| DT 110 Withholding Tax Return (v1.2, 2020) - Ghana Revenue Authority (GRA) | https://gra.gov.gh/wp-content/uploads/2022/02/withholding_tax_return_form_v1_2_2020-.xlsx | 2026-10-28 | Official | Fetched and read | Layout check of the Withholding Tax Report (gross amount of payment, WHT type, rate, tax withheld) **Note:** Spreadsheet strings were read; formulas/validation lists were not analysed. |
| Amendments - Income Tax Act, 2026 (Act 1178) (GRA notice) - Ghana Revenue Authority (GRA) | https://gra.gov.gh/wp-content/uploads/2026/09/Amendments-To-The-Income-Tax-2015-Act-896_Updated-1.pdf | 2026-10-28 | Official | Fetched and read | Checked that the 1 September 2026 income tax amendment changes personal income tax bands and the MTS threshold only, not the withholding tax rates modelled here |
| VAT on Imports and Exports - Ghana Revenue Authority - Ghana Revenue Authority (GRA) | https://gra.gov.gh/domestic-tax/tax-types/vat-on-imports-and-exports/ | 2026-10-28 | Official | Fetched and read | Import VAT is charged at importation and reclaimable as input tax by registered importers **Note:** Cites Act 1151 ss.35-37 and 50 for exports but does not state their content. |
| VAT Exemptions - Ghana Revenue Authority - Ghana Revenue Authority (GRA) | https://gra.gov.gh/domestic-tax/tax-types/vat-exemptions/ | 2026-10-28 | Official | Fetched and read | Exempt supplies list (documentation only). Page cites Act 870 for the list |
| Income Tax Act, 2015 (Act 896) - Parliament of Ghana (published by GRA) | https://gra.gov.gh/wp-content/uploads/2020/09/INCOME-TAX-ACT-2015-ACT-896.pdf | 2026-10-28 | Official | Could not be opened | Intended source for the First Schedule withholding rates. NOT used: the 182-page PDF is image-only and was not OCR-read. No rate in the module cites it; rates come from the GRA withholding tax page **Note:** Downloaded (HTTP 200) but not readable as text. |

### ISO sources

| Title and publisher | URL / path | Date accessed | Type | Status | Used for |
|---|---|---|---|---|---|
| ISO 3166-2:GH - Online Browsing Platform - International Organization for Standardization | https://www.iso.org/obp/ui/#iso:code:3166:GH | 2026-10-28 | Official | Could not be opened | Authority for the region codes. The page returned HTTP 403, so the codes were cross-checked against Wikipedia only **Note:** Not verified against the ISO platform. |
| ISO 3166-2:GH - Wikipedia | https://en.wikipedia.org/wiki/ISO_3166-2:GH | 2026-10-28 | Secondary | Fetched and read | 16 current region codes and names; GH-BA (Brong-Ahafo) deleted 2019-11-22 **Note:** Secondary cross-check only. Agrees with the code list given in the build brief. |

### Odoo source and documentation

| Title and publisher | URL / path | Date accessed | Type | Status | Used for |
|---|---|---|---|---|---|
| Accounting localization (Odoo 20.0 developer documentation) - Odoo S.A. | https://www.odoo.com/documentation/latest/developer/howtos/accounting_localization.html | 2026-10-28 | Official | Fetched and read | Module structure overview **Note:** The fetch tool returned only the table of contents (the body was truncated), so the Odoo 20.0 source code below was used as the real reference. |
| addons/l10n_ke/__manifest__.py - Odoo S.A. (odoo/odoo, 20.0) | addons/l10n_ke/__manifest__.py | 2026-10-28 | Official | Fetched and read | Manifest keys (countries, auto_install, data/demo layout) |
| addons/l10n_ke/models/template_ke.py - Odoo S.A. (odoo/odoo, 20.0) | addons/l10n_ke/models/template_ke.py | 2026-10-28 | Official | Fetched and read | @template data keys: code_digits, res.company fields, account.account stock variation |
| addons/l10n_za/models/template_za.py and __manifest__.py - Odoo S.A. (odoo/odoo, 20.0) | addons/l10n_za/models/template_za.py | 2026-10-28 | Official | Fetched and read | Second template reference |
| addons/l10n_ke/data/template/account.{account,tax,tax.group,fiscal.position}-ke.csv - Odoo S.A. (odoo/odoo, 20.0) | addons/l10n_ke/data/template/account.tax-ke.csv | 2026-10-28 | Official | Fetched and read | CSV columns for accounts, taxes (repartition lines, fiscal_position_ids, original_tax_ids), tax groups, fiscal positions |
| addons/l10n_ng/data/template/account.fiscal.position-ng.csv - Odoo S.A. (odoo/odoo, 20.0) | addons/l10n_ng/data/template/account.fiscal.position-ng.csv | 2026-10-28 | Official | Fetched and read | Fiscal position CSV columns |
| addons/l10n_au/data/template/account.tax-au.csv - Odoo S.A. (odoo/odoo, 20.0) | addons/l10n_au/data/template/account.tax-au.csv | 2026-10-28 | Official | Fetched and read | Group taxes (amount_type group, children_tax_ids) and tax_scope |
| addons/l10n_ke/data/account_tax_report_data.xml - Odoo S.A. (odoo/odoo, 20.0) | addons/l10n_ke/data/account_tax_report_data.xml | 2026-10-28 | Official | Fetched and read | account.report XML under account.generic_tax_report: tax_tags formulas, editable external lines, _carryover_* / _applied_carryover_* expressions |
| addons/l10n_in/data/res_country_state_data.xml - Odoo S.A. (odoo/odoo, 20.0) | addons/l10n_in/data/res_country_state_data.xml | 2026-10-28 | Official | Fetched and read | res.country.state XML pattern |
| addons/account/models/chart_template.py - Odoo S.A. (odoo/odoo, 20.0) | addons/account/models/chart_template.py | 2026-10-28 | Official | Fetched and read | Tag mapper (tag names are unsigned, report formula sign is separate), TAX_TAG_DELIMITER, template loading |
| addons/account/models/ir_module.py - Odoo S.A. (odoo/odoo, 20.0) | addons/account/models/ir_module.py | 2026-10-28 | Official | Fetched and read | How templates are discovered (models/template_*.py, @template) |
| addons/account/models/account_tax.py - Odoo S.A. (odoo/odoo, 20.0) | addons/account/models/account_tax.py | 2026-10-28 | Official | Fetched and read | account.tax fields (fiscal_position_ids, original_tax_ids, tax_scope, group children constraint) |
| addons/account/models/partner.py (account.fiscal.position) - Odoo S.A. (odoo/odoo, 20.0) | addons/account/models/partner.py | 2026-10-28 | Official | Fetched and read | Fiscal position tax mapping semantics (map_tax) |
| addons/account/models/company.py - Odoo S.A. (odoo/odoo, 20.0) | addons/account/models/company.py | 2026-10-28 | Official | Fetched and read | res.company account fields, domestic fiscal position computation |
| addons/account/models/account_account.py - Odoo S.A. (odoo/odoo, 20.0) | addons/account/models/account_account.py | 2026-10-28 | Official | Fetched and read | Valid account_type values in 20.0 |
| addons/account/models/template_generic_coa.py - Odoo S.A. (odoo/odoo, 20.0) | addons/account/models/template_generic_coa.py | 2026-10-28 | Official | Fetched and read | Company default account keys set by a chart template |
| account_reports/models/account_report.py and data/balance_sheet.xml, profit_and_loss.xml - Odoo S.A. (odoo/enterprise, 20.0) | enterprise/account_reports/data/balance_sheet.xml | 2026-10-28 | Official | Fetched and read | Carryover mechanics (if_below), balance sheet / P&L line structure and current-year earnings domain |

### Secondary sources

| Title and publisher | URL / path | Date accessed | Type | Status | Used for |
|---|---|---|---|---|---|
| Ghana - Corporate - Withholding taxes - PwC Worldwide Tax Summaries | https://taxsummaries.pwc.com/ghana/corporate/withholding-taxes | 2026-10-28 | Secondary | Fetched and read | Cross-check only of the GRA withholding rates **Note:** Agrees with the GRA page for every rate modelled. Disagrees on unprocessed precious minerals (1.5% vs GRA 3%) and lists extra rows (realisation of assets) absent from the GRA page; neither is modelled. |
| Ghana - Corporate - Other taxes - PwC Worldwide Tax Summaries | https://taxsummaries.pwc.com/ghana/corporate/other-taxes | 2026-10-28 | Secondary | Fetched and read | Cross-check only: VAT 15%, NHIL 2.5%, GETFund 2.5%, levies on imports of goods and imported services **Note:** Does not mention the threshold, flat rate scheme or COVID-19 levy, so nothing was taken from it. |

