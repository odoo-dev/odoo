from lxml import etree

from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from odoo.tests import TransactionCase, tagged
from odoo.tools import file_path

REPORT_DATA_FILE = 'l10n_az/data/account_tax_report_withholding_data.xml'

LINE_NAMES = {
    'az_1w': '1. 4% Risk insurance or reinsurance payments',
    'az_2w': '2. 5% Dividends paid by resident enterprises',
    'az_3w': '3. 6% Telecommunications or international transport services',
    'az_4w': '4. 10% Interest paid by residents, PEs of non-residents, or on behalf of such PEs'
             ' (except for interest paid to resident banks or to PEs of non-resident banks)',
    'az_5w': '5. 10% Payments to low-tax jurisdictions',
    'az_6w': '6. 14% Rental fees for movable and immovable property',
    'az_7w': '7. 14% Royalties',
    'az_8w': '8. 10% Other Azerbaijani-source income',
    'az_9w': 'Totals',
}
LINE_NAMES_AZ = {
    'az_1w': '4% Risk sığortası/təkrarsığorta',
    'az_2w': '5% Dividendlər',
    'az_3w': '6% Telekommunikasiya/beynəlxalq daşımalar',
    'az_4w': '10% Faizlər',
    'az_5w': '10% Güzəştli vergi tutulan ölkələrə ödənişlər',
    'az_6w': '14% İcarə haqları',
    'az_7w': '14% Royalti',
    'az_8w': '10% Digər Azərbaycan mənbəyindən gəlirlər',
    'az_9w': 'Cəmi',
}


class TestAzWithholdingTaxReportCommon(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.report = cls.env.ref('l10n_az.tax_report_withholding_tax')
        cls.country_az = cls.env.ref('base.az')


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestAzWithholdingTaxReport(TestAzWithholdingTaxReportCommon):

    def test_report_definition(self):
        self.assertEqual(self.report.name, 'Withholding Tax Report')
        self.assertEqual(self.report.country_id, self.country_az)
        self.assertEqual(self.report.root_report_id, self.env.ref('account.generic_tax_report'))
        self.assertEqual(self.report.availability_condition, 'country')
        self.assertTrue(self.report.allow_foreign_vat)

    def test_report_columns(self):
        self.assertEqual(
            [(column.name, column.expression_label, column.figure_type) for column in self.report.column_ids],
            [('Base', 'base', 'monetary'), ('Tax', 'tax', 'monetary')],
        )

    def test_line_codes(self):
        expected_codes = [f'az_{n}w{suffix}' for n in range(1, 9) for suffix in ('', '_g', '_d')] + ['az_9w']
        self.assertEqual(len(self.report.line_ids), 25)
        self.assertEqual(sorted(self.report.line_ids.mapped('code')), sorted(expected_codes))

    def test_line_hierarchy(self):
        root_lines = self.report.line_ids.filtered(lambda line: not line.parent_id)
        self.assertEqual(root_lines.mapped('code'), [f'az_{n}w' for n in range(1, 10)])
        for n in range(1, 9):
            line = self._get_line(f'az_{n}w')
            self.assertEqual(line.hierarchy_level, 1)
            self.assertEqual(line.children_ids.mapped('code'), [f'az_{n}w_g', f'az_{n}w_d'])
            self.assertEqual(line.children_ids.mapped('hierarchy_level'), [3, 3])
            self.assertEqual(line.foldability, 'foldable')
        total_line = self._get_line('az_9w')
        self.assertEqual(total_line.hierarchy_level, 0)
        self.assertFalse(total_line.children_ids)

    def test_line_names(self):
        for code, name in LINE_NAMES.items():
            self.assertEqual(self._get_line(code).name, name)
        for n in range(1, 9):
            self.assertEqual(self._get_line(f'az_{n}w_g').name, 'Gross')
            self.assertEqual(self._get_line(f'az_{n}w_d').name, 'Deducted')

    def test_expression_labels(self):
        for line in self.report.line_ids:
            self.assertEqual(sorted(line.expression_ids.mapped('label')), ['base', 'tax'], line.code)
        self.assertEqual(len(self.report.line_ids.expression_ids), 50)

    def test_child_expressions(self):
        for n in range(1, 9):
            for suffix, tag_suffix in (('g', 'G'), ('d', 'D')):
                line = self._get_line(f'az_{n}w_{suffix}')
                self.assertEqual(
                    self._expression_values(line),
                    {
                        'base': ('tax_tags', f'{n}(B)_W_{tag_suffix}'),
                        'tax': ('tax_tags', f'-{n}(T)_W_{tag_suffix}'),
                    },
                )

    def test_parent_expressions(self):
        for n in range(1, 9):
            self.assertEqual(
                self._expression_values(self._get_line(f'az_{n}w')),
                {
                    'base': ('aggregation', f'az_{n}w_g.base + az_{n}w_d.base'),
                    'tax': ('aggregation', f'az_{n}w_g.tax + az_{n}w_d.tax'),
                },
            )

    def test_total_expressions(self):
        self.assertEqual(
            self._expression_values(self._get_line('az_9w')),
            {
                'base': ('aggregation', ' + '.join(f'az_{n}w.base' for n in range(1, 9))),
                'tax': ('aggregation', ' + '.join(f'az_{n}w.tax' for n in range(1, 9))),
            },
        )

    def test_expression_engines(self):
        engines = self.report.line_ids.expression_ids.mapped('engine')
        self.assertEqual(set(engines), {'tax_tags', 'aggregation'})
        self.assertEqual(engines.count('tax_tags'), 32)
        self.assertEqual(engines.count('aggregation'), 18)

    def test_aggregation_formulas_reference_existing_codes(self):
        codes = set(self.report.line_ids.mapped('code'))
        for expression in self.report.line_ids.expression_ids.filtered(lambda e: e.engine == 'aggregation'):
            for term in expression.formula.split(' + '):
                self.assertIn(term.split('.')[0], codes)

    def test_tags_are_not_duplicated(self):
        tags = self.env['account.account.tag'].with_context(active_test=False).search([
            ('country_id', '=', self.country_az.id),
            ('applicability', '=', 'taxes'),
        ])
        self.assertEqual(len(tags), 65)
        names = tags.mapped('name')
        self.assertEqual(len(set(names)), 65)
        self.assertFalse([name for name in names if name.startswith('-')])

    def test_withholding_tags_are_unsigned(self):
        for n in range(1, 9):
            for letter in ('b', 't'):
                for suffix in ('g', 'd'):
                    tag = self.env.ref(f'l10n_az.az_tag_{n}_{letter}_w_{suffix}')
                    self.assertEqual(tag.name, f'{n}({letter.upper()})_W_{suffix.upper()}')
                    self.assertEqual(tag.applicability, 'taxes')
                    self.assertEqual(tag.country_id, self.country_az)

    def test_expressions_reuse_module_tags(self):
        for n in range(1, 9):
            for suffix in ('g', 'd'):
                line = self._get_line(f'az_{n}w_{suffix}')
                for label, letter in (('base', 'b'), ('tax', 't')):
                    expression = line.expression_ids.filtered(lambda e: e.label == label)
                    matching_tags = expression._get_matching_tags()
                    self.assertEqual(len(matching_tags), 1, expression.formula)
                    self.assertEqual(matching_tags, self.env.ref(f'l10n_az.az_tag_{n}_{letter}_w_{suffix}'))

    def test_azerbaijani_labels_in_data_file(self):
        """ name@az is skipped at load time by convert.py, so it is asserted on the file itself. """
        tree = etree.parse(file_path(REPORT_DATA_FILE))
        translations = {}
        for record in tree.iterfind('.//record[@model="account.report.line"]'):
            translations[record.findtext('field[@name="code"]')] = record.findtext('field[@name="name@az"]')
        self.assertEqual(len(translations), 25)
        for code, name_az in LINE_NAMES_AZ.items():
            self.assertEqual(translations[code], name_az)
        for n in range(1, 9):
            self.assertEqual(translations[f'az_{n}w_g'], 'Ümumi məbləğ')
            self.assertEqual(translations[f'az_{n}w_d'], 'Tutulan məbləğ')
        report_node = tree.find('.//record[@model="account.report"]')
        self.assertEqual(
            report_node.findtext('field[@name="name@az"]'),
            'Ödəmə Mənbəyində Tutulan Vergi Bəyannaməsi',
        )

    def _get_line(self, code):
        return self.report.line_ids.filtered(lambda line: line.code == code)

    def _expression_values(self, line):
        return {expression.label: (expression.engine, expression.formula) for expression in line.expression_ids}


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestAzWithholdingTaxReportTaxes(AccountTestInvoicingCommon):
    chart_template = 'az'
    country_code = 'AZ'

    def test_report_tags_are_used_by_taxes(self):
        """ Every tag the report reads must be set by one of the shipped withholding taxes. """
        taxes = self.env['account.tax'].with_context(active_test=False).search([
            ('company_id', '=', self.env.company.id),
        ])
        tax_tag_names = set(taxes.repartition_line_ids.tag_ids.mapped('name'))
        for n in range(1, 9):
            for letter in ('B', 'T'):
                for suffix in ('G', 'D'):
                    self.assertIn(f'{n}({letter})_W_{suffix}', tax_tag_names)

    def test_gross_withholding_flow(self):
        """ Paying a bill with a gross withholding tax books the tax on 52190/52192 without touching the payable. """
        chart_template = self.env['account.chart.template'].with_company(self.env.company)
        tax = chart_template.ref('az_tax_wht_ins_4_g')
        bill = self.init_invoice('in_invoice', amounts=[100], taxes=tax, invoice_date='2024-01-15', post=True)

        payable_lines = bill.line_ids.filtered(lambda line: line.account_id.account_type == 'liability_payable')
        self.assertEqual(payable_lines.mapped('balance'), [-100.0])

        self.env['account.payment.register'].with_context(
            active_model='account.move', active_ids=bill.ids,
        ).create({'payment_date': '2024-01-20'})._create_payments()
        self.assertEqual(bill.payment_state, 'paid')

        caba_move = self.env['account.move'].search([('tax_cash_basis_origin_move_id', '=', bill.id)])
        self.assertEqual(len(caba_move), 1)
        plus_leg = caba_move.line_ids.filtered(lambda line: line.account_id.code == '52190')
        minus_leg = caba_move.line_ids.filtered(lambda line: line.account_id.code == '52192')
        self.assertTrue(plus_leg)
        self.assertFalse(plus_leg.tax_tag_ids)
        self.assertTrue(minus_leg)
        self.assertEqual(minus_leg.tax_tag_ids.mapped('name'), ['1(T)_W_G'])
        base_tags = (caba_move.line_ids - plus_leg - minus_leg).tax_tag_ids
        self.assertIn('1(B)_W_G', base_tags.mapped('name'))
