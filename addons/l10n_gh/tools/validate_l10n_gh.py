#!/usr/bin/env python3
# Part of Odoo. See LICENSE file for full copyright and licensing details.
"""Static validator for l10n_gh. Usage: python3 validate_l10n_gh.py [path/to/l10n_gh]

Checks (exit code 1 on any failure):
  1. every XML parses, every Python file compiles, the manifest is a dict with the expected keys
  2. XML ids are unique (XML records + template CSV ids); account codes are unique
  3. every account / tax group / fiscal position / original tax / child tax referenced by the CSVs
     (and by models/template_gh.py) exists
  4. every account_type is valid for Odoo 20.0 (read from the Odoo source when available)
  5. per tax: invoice and refund repartition lines match in count, order and factor_percent;
     exactly one base line each; tax lines sum to +100 (and negative lines to -100 or 0);
     reverse-charge taxes net to zero
  6. tax tags: every tag used in a CSV exists in a report tax_tags expression and every report
     tax_tags formula (sign stripped) is used by some tax  (both directions)
  7. aggregation formulas refer to line codes and expression labels that exist (also carryover targets)
  8. exactly 16 Ghana states with the ISO 3166-2:GH codes, no GH-BA
  9. every URL cited in REFERENCES.md (and in other module files) appears in the README
     "Research Documents" list, and the two lists have the same URLs
"""
import ast
import csv
import glob
import os
import re
import sys
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
MOD = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.dirname(HERE)
ODOO_ACCOUNT = '/home/odoo/odoo/community/addons/account/models/account_account.py'

FALLBACK_TYPES = {
    'asset_receivable', 'asset_cash', 'asset_current', 'asset_non_current', 'asset_prepayments', 'asset_fixed',
    'liability_payable', 'liability_credit_card', 'liability_current', 'liability_non_current', 'equity',
    'equity_unaffected', 'income', 'income_other', 'expense', 'expense_other', 'expense_depreciation',
    'expense_direct_cost', 'off_balance',
}
ISO_STATES = {
    'AF': 'Ahafo', 'AH': 'Ashanti', 'BO': 'Bono', 'BE': 'Bono East', 'CP': 'Central', 'EP': 'Eastern',
    'AA': 'Greater Accra', 'NE': 'North East', 'NP': 'Northern', 'OT': 'Oti', 'SV': 'Savannah',
    'UE': 'Upper East', 'UW': 'Upper West', 'TV': 'Volta', 'WP': 'Western', 'WN': 'Western North',
}

errors = []
stats = {}


def err(msg):
    errors.append(msg)


def path(*p):
    return os.path.join(MOD, *p)


def read_csv(name):
    with open(path('data', 'template', name), newline='', encoding='utf-8') as fh:
        return list(csv.DictReader(fh))


# ---------------------------------------------------------------------------- 1. syntax
def check_syntax():
    n = 0
    for f in glob.glob(path('**', '*.xml'), recursive=True):
        try:
            ET.parse(f)
            n += 1
        except ET.ParseError as e:
            err('XML parse error %s: %s' % (f, e))
    stats['xml_files'] = n
    n = 0
    for f in glob.glob(path('**', '*.py'), recursive=True):
        try:
            compile(open(f, encoding='utf-8').read(), f, 'exec')
            n += 1
        except SyntaxError as e:
            err('Python syntax error %s: %s' % (f, e))
    stats['py_files'] = n
    try:
        manifest = ast.literal_eval(open(path('__manifest__.py'), encoding='utf-8').read().split('\n', 1)[1])
    except Exception as e:  # noqa: BLE001
        err('manifest is not a literal dict: %s' % e)
        return {}
    if not isinstance(manifest, dict):
        err('manifest is not a dict')
        return {}
    for k, v in (('countries', ['gh']), ('category', 'Accounting/Localizations/Account Charts'),
                 ('depends', ['account']), ('auto_install', ['account']), ('license', 'LGPL-3')):
        if manifest.get(k) != v:
            err('manifest[%r] = %r, expected %r' % (k, manifest.get(k), v))
    if 'Legal basis' not in manifest.get('description', ''):
        err('manifest description has no "Legal basis" section')
    for f in manifest.get('data', []) + manifest.get('demo', []):
        if not os.path.exists(path(f)):
            err('manifest lists a missing file: %s' % f)
    return manifest


# ---------------------------------------------------------------------------- 2. ids
def xml_ids():
    ids = []
    for f in glob.glob(path('data', '*.xml')) + glob.glob(path('demo', '*.xml')):
        for el in ET.parse(f).iter('record'):
            ids.append((os.path.basename(f), el.get('id'), el.get('model')))
    return ids


def check_unique_ids():
    seen = {}
    for f, i, model in xml_ids():
        if i in seen:
            err('duplicate XML id %r (%s and %s)' % (i, seen[i], f))
        seen[i] = f
    for name in ('account.account-gh.csv', 'account.tax.group-gh.csv', 'account.fiscal.position-gh.csv'):
        ids = [r['id'] for r in read_csv(name)]
        if len(ids) != len(set(ids)):
            err('duplicate ids in %s' % name)
    tax_ids = [r['id'] for r in read_csv('account.tax-gh.csv') if r['id']]
    if len(tax_ids) != len(set(tax_ids)):
        err('duplicate ids in account.tax-gh.csv')
    # template ids share one namespace per model only; also catch clashes with XML ids
    all_csv = set(tax_ids)
    for name in ('account.account-gh.csv', 'account.tax.group-gh.csv', 'account.fiscal.position-gh.csv'):
        all_csv |= {r['id'] for r in read_csv(name)}
    for _f, i, _m in xml_ids():
        if i in all_csv:
            err('XML id %r also used in a template CSV' % i)
    codes = [r['code'] for r in read_csv('account.account-gh.csv')]
    if len(codes) != len(set(codes)):
        err('duplicate account codes: %s' % sorted({c for c in codes if codes.count(c) > 1}))
    for c in codes:
        if not re.fullmatch(r'\d{6}', c):
            err('account code %r is not 6 digits' % c)
    stats['accounts'] = len(codes)
    stats['xml_ids'] = len(xml_ids())


# ---------------------------------------------------------------------------- 3-5 taxes
def parse_taxes():
    taxes, current = {}, None
    for r in read_csv('account.tax-gh.csv'):
        if r['id']:
            current = dict(r, reps={'invoice': [], 'refund': []})
            taxes[r['id']] = current
        if r['repartition_line_ids/repartition_type']:
            current['reps'][r['repartition_line_ids/document_type']].append(dict(
                type=r['repartition_line_ids/repartition_type'],
                tag=r['repartition_line_ids/tag_ids'],
                factor=r['repartition_line_ids/factor_percent'],
                account=r['repartition_line_ids/account_id']))
    return taxes


def check_references_and_taxes(taxes):
    account_types = FALLBACK_TYPES
    if os.path.exists(ODOO_ACCOUNT):
        src = open(ODOO_ACCOUNT, encoding='utf-8').read()
        block = src.split('account_type = fields.Selection(', 1)[1].split('string="Type"', 1)[0]
        found = set(re.findall(r'\("([a-z_]+)",', block))
        if found:
            account_types = found
            stats['account_types_source'] = 'Odoo 20.0 source'
    accounts = {r['id']: r for r in read_csv('account.account-gh.csv')}
    for a in accounts.values():
        if a['account_type'] not in account_types:
            err('account %s: invalid account_type %r' % (a['id'], a['account_type']))
        for tag in filter(None, a['tag_ids'].split(',')):
            if tag not in ('account.account_tag_investing', 'account.account_tag_financing', 'account.account_tag_operating'):
                err('account %s: unknown account tag %r' % (a['id'], tag))
    groups = {r['id'] for r in read_csv('account.tax.group-gh.csv')}
    fps = {r['id'] for r in read_csv('account.fiscal.position-gh.csv')}
    stats['taxes'] = len(taxes)
    for tid, t in taxes.items():
        if t['tax_group_id'] not in groups:
            err('tax %s: unknown tax group %r' % (tid, t['tax_group_id']))
        for fp in filter(None, t['fiscal_position_ids'].split(',')):
            if fp not in fps:
                err('tax %s: unknown fiscal position %r' % (tid, fp))
        for o in filter(None, t['original_tax_ids'].split(',')):
            if o not in taxes:
                err('tax %s: unknown original tax %r' % (tid, o))
            elif taxes[o]['type_tax_use'] != t['type_tax_use']:
                err('tax %s: original tax %s has a different type_tax_use' % (tid, o))
        children = list(filter(None, t['children_tax_ids'].split(',')))
        for c in children:
            if c not in taxes:
                err('tax %s: unknown child tax %r' % (tid, c))
            else:
                if taxes[c]['type_tax_use'] != t['type_tax_use']:
                    err('tax %s: child %s has a different type_tax_use' % (tid, c))
                if taxes[c]['tax_scope'] not in ('', t['tax_scope']):
                    err('tax %s: child %s has an incompatible tax_scope' % (tid, c))
        if t['amount_type'] == 'group':
            if not children:
                err('group tax %s has no children' % tid)
            if t['reps']['invoice'] or t['reps']['refund']:
                err('group tax %s must not have repartition lines' % tid)
            for c in children:
                if c in taxes and t['active'] == '1' and taxes[c]['active'] != '1':
                    err('group tax %s is active but child %s is inactive (Odoo 20 ignores inactive children)' % (tid, c))
            continue
        inv, ref = t['reps']['invoice'], t['reps']['refund']
        for doc, lines in (('invoice', inv), ('refund', ref)):
            if sum(1 for x in lines if x['type'] == 'base') != 1:
                err('tax %s: %s needs exactly one base line' % (tid, doc))
            if not any(x['type'] == 'tax' for x in lines):
                err('tax %s: %s needs a tax line' % (tid, doc))
            for x in lines:
                if x['account'] and x['account'] not in accounts:
                    err('tax %s: unknown account %r in %s repartition' % (tid, x['account'], doc))
        if len(inv) != len(ref):
            err('tax %s: invoice (%d) and refund (%d) repartition counts differ' % (tid, len(inv), len(ref)))
        else:
            for i, (a, b) in enumerate(zip(inv, ref)):
                if a['type'] != b['type'] or a['factor'] != b['factor'] or a['tag'] != b['tag'] or a['account'] != b['account']:
                    err('tax %s: repartition line %d differs between invoice and refund (%s vs %s)' % (tid, i + 1, a, b))
        factors = [float(x['factor']) for x in inv if x['type'] == 'tax']
        pos, neg = sum(f for f in factors if f > 0), sum(f for f in factors if f < 0)
        if round(pos, 4) != 100.0:
            err('tax %s: positive tax factors sum to %s, expected 100' % (tid, pos))
        if neg and round(pos + neg, 4) != 0.0:
            err('tax %s: reverse-charge lines do not net to zero (%s%s)' % (tid, pos, neg))
        if tid.startswith('gh_rc_') and not neg:
            err('reverse charge tax %s has no negative repartition line' % tid)
    return accounts, groups, fps


def check_template_py(accounts, taxes):
    src = open(path('models', 'template_gh.py'), encoding='utf-8').read()
    for ref in re.findall(r"'(gh\d{6})'", src):
        if ref not in accounts:
            err('template_gh.py references unknown account %r' % ref)
    for ref in re.findall(r"'account_(?:sale|purchase)_tax_id': '([^']+)'", src):
        if ref not in taxes:
            err('template_gh.py references unknown tax %r' % ref)
        elif taxes[ref]['active'] != '1':
            err('template_gh.py default tax %r is inactive' % ref)
    for key in ('code_digits', "'6'", 'account_fiscal_country_id', 'account_stock_valuation_id'):
        if key not in src:
            err('template_gh.py is missing %s' % key)


# ---------------------------------------------------------------------------- 6-7 reports
def load_reports():
    """Return list of reports: dict(file, id, lines={code: {labels}}, tag_formulas, aggs, carry_targets)."""
    out = []
    for f in sorted(set(glob.glob(path('data', '*report*.xml')) + glob.glob(path('data', 'account_*_data.xml')))):
        root = ET.parse(f).getroot()
        for rep in root.findall("record[@model='account.report']"):
            info = dict(file=os.path.basename(f), id=rep.get('id'), lines={}, tags=[], aggs=[], targets=[], root=None)
            for fld in rep.findall('field'):
                if fld.get('name') == 'root_report_id':
                    info['root'] = fld.get('ref')
                if fld.get('name') == 'country_id':
                    info['country'] = fld.get('ref')
            for ln in rep.iter('record'):
                if ln.get('model') != 'account.report.line':
                    continue
                code = None
                labels = set()
                for fld in ln.findall('field'):
                    if fld.get('name') == 'code':
                        code = (fld.text or '').strip()
                    if fld.get('name') == 'aggregation_formula':
                        info['aggs'].append((ln.get('id'), (fld.text or '').strip()))
                        labels.add('balance')
                    if fld.get('name') == 'account_codes_formula':
                        labels.add('balance')
                    if fld.get('name') == 'expression_ids':
                        for ex in fld.findall('record'):
                            d = {f2.get('name'): (f2.text or '').strip() for f2 in ex.findall('field')}
                            labels.add(d.get('label'))
                            if d.get('engine') == 'tax_tags':
                                info['tags'].append((ex.get('id'), d['formula']))
                            if d.get('engine') == 'aggregation':
                                info['aggs'].append((ex.get('id'), d['formula']))
                            if d.get('carryover_target'):
                                info['targets'].append((ex.get('id'), d['carryover_target']))
                if code:
                    if code in info['lines']:
                        err('%s: duplicate line code %s' % (f, code))
                    info['lines'][code] = labels
            out.append(info)
    return out


def check_reports(taxes):
    reports = load_reports()
    stats['reports'] = len(reports)
    names = {r['id'] for r in reports}
    for need in ('tax_report_gh_vat', 'tax_report_gh_wht'):
        if need not in names:
            err('missing report %s' % need)
    for r in reports:
        if r['id'] in ('tax_report_gh_vat', 'tax_report_gh_wht'):
            if r['root'] != 'account.generic_tax_report' or r.get('country') != 'base.gh':
                err('%s must be registered under account.generic_tax_report for base.gh' % r['id'])
    report_tags = set()
    for r in reports:
        for _eid, formula in r['tags']:
            report_tags.add(formula.lstrip('-').strip())
        for eid, formula in r['aggs']:
            for code, label in re.findall(r'([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)', formula):
                if code not in r['lines']:
                    err('%s: aggregation %s refers to unknown line code %s' % (r['id'], eid, code))
                elif label not in r['lines'][code]:
                    err('%s: aggregation %s refers to unknown label %s.%s' % (r['id'], eid, code, label))
        for eid, target in r['targets']:
            code, label = target.split('.')
            if code not in r['lines'] or label not in r['lines'][code]:
                err('%s: carryover target %s of %s does not exist' % (r['id'], target, eid))
    vat = next((r for r in reports if r['id'] == 'tax_report_gh_vat'), None)
    if vat:
        labels = set().union(*vat['lines'].values())
        for must in ('base', 'vat', 'nhil', 'getfund', '_carryover_vat', '_applied_carryover_vat',
                     '_carryover_nhil', '_applied_carryover_nhil', '_carryover_getfund', '_applied_carryover_getfund'):
            if must not in labels:
                err('VAT Return is missing expression label %s' % must)
    csv_tags = set()
    for tid, t in taxes.items():
        for doc in ('invoice', 'refund'):
            for x in t['reps'][doc]:
                if x['tag']:
                    csv_tags.add(x['tag'])
                    if x['tag'].startswith('-') or x['tag'].startswith('+'):
                        err('tax %s: tag %r must be unsigned in the CSV' % (tid, x['tag']))
    for tag in sorted(csv_tags - report_tags):
        err('tax tag %r is used by a tax but no report expression uses it' % tag)
    for tag in sorted(report_tags - csv_tags):
        err('report tax_tags formula %r is not used by any tax repartition line' % tag)
    stats['tax_tags'] = len(csv_tags)


# ---------------------------------------------------------------------------- 8 states
def check_states():
    root = ET.parse(path('data', 'res_country_state_data.xml')).getroot()
    got = {}
    for rec in root.findall("record[@model='res.country.state']"):
        d = {f.get('name'): (f.text or f.get('ref') or '').strip() for f in rec.findall('field')}
        if d.get('country_id') != 'base.gh':
            err('state %s is not for base.gh' % rec.get('id'))
        if rec.get('id') != 'state_gh_' + d['code'].lower():
            err('state id %s does not match code %s' % (rec.get('id'), d['code']))
        got[d['code']] = d['name']
    if len(got) != 16:
        err('expected 16 states, found %d' % len(got))
    if got != ISO_STATES:
        err('state codes/names differ from the ISO list: %s' % {k: (got.get(k), ISO_STATES.get(k))
                                                               for k in set(got) | set(ISO_STATES) if got.get(k) != ISO_STATES.get(k)})
    if 'BA' in got:
        err('GH-BA must not exist')
    stats['states'] = len(got)


# ---------------------------------------------------------------------------- 9 documents
URL_RE = re.compile(r'https?://[^\s<>|)\]"\'`]+')


def clean(u):
    return u.rstrip('.,;:')


def check_documents():
    readme = open(path('README.md'), encoding='utf-8').read()
    refs = open(path('REFERENCES.md'), encoding='utf-8').read()
    if '## Research Documents' not in readme:
        err('README.md has no "Research Documents" section')
        return
    section = readme.split('## Research Documents', 1)[1]
    nxt = re.search(r'\n## ', section)
    section = section[:nxt.start()] if nxt else section
    readme_urls = {clean(u) for u in URL_RE.findall(section)}
    ref_urls = {clean(u) for u in URL_RE.findall(refs)}
    for u in sorted(ref_urls - readme_urls):
        err('URL cited in REFERENCES.md is missing from README Research Documents: %s' % u)
    for u in sorted(readme_urls - ref_urls):
        # documents opened but not cited in REFERENCES rows are allowed only if REFERENCES lists them too
        err('URL in README Research Documents is missing from REFERENCES.md: %s' % u)
    for group in ('Official legal and tax sources', 'ISO sources', 'Odoo source and documentation', 'Secondary sources'):
        if '### ' + group not in section:
            err('Research Documents is missing group %r' % group)
    # every URL appearing in other module files must be in the list
    for f in glob.glob(path('**', '*'), recursive=True):
        if os.path.isdir(f) or f.endswith(('README.md', 'REFERENCES.md', '.pyc', '.zip')) or '__pycache__' in f:
            continue
        if os.path.basename(f) == 'sources.py':
            continue
        try:
            text = open(f, encoding='utf-8').read()
        except UnicodeDecodeError:
            continue
        for u in URL_RE.findall(text):
            u = clean(u)
            if 'odoo.com/documentation/latest/applications' in u:  # manifest website, not a cited source
                continue
            if u not in readme_urls:
                err('%s cites a URL not in the Research Documents list: %s' % (os.path.relpath(f, MOD), u))
    # status vocabulary
    for m in re.finditer(r'\| (Official|Secondary) \| ([^|]+) \|', section):
        if m.group(2).strip() not in ('Fetched and read', 'Search result only (not opened)', 'Could not be opened'):
            err('unknown status %r in Research Documents' % m.group(2))
    stats['research_urls'] = len(readme_urls)


def main():
    check_syntax()
    check_unique_ids()
    taxes = parse_taxes()
    accounts, _groups, _fps = check_references_and_taxes(taxes)
    check_template_py(accounts, taxes)
    check_reports(taxes)
    check_states()
    check_documents()
    print('Validated %s' % MOD)
    print('  stats: ' + ', '.join('%s=%s' % kv for kv in sorted(stats.items())))
    if errors:
        print('FAILED with %d error(s):' % len(errors))
        for e in errors:
            print('  - ' + e)
        return 1
    print('OK - all checks passed')
    return 0


if __name__ == '__main__':
    sys.exit(main())
