from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from odoo.tests import TransactionCase, tagged

EXPRESSIONS = {
    'az_sv1': ('custom', '_report_engine_l10n_az_tit_month1', None),
    'az_sv2': ('custom', '_report_engine_l10n_az_tit_month2', None),
    'az_sv3': ('custom', '_report_engine_l10n_az_tit_month3', None),
    'az_sv4': ('aggregation', 'az_sv1.base+az_sv2.base+az_sv3.base+az_sv5.base', None),
    'az_sv5': ('domain', "[('account_id.account_type','=','income_other')]", '-sum'),
    'az_sv6': ('aggregation', '2', None),
    'az_sv7': ('aggregation', 'az_sv4.base * az_sv6.base / 100', None),
    'az_sv8': ('tax_tags', 'SV1', None),
    'az_sv9': ('aggregation', 'az_sv7.base - az_sv8.base', None),
}


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestAzTitReport(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.report = cls.env.ref('l10n_az.tax_report_tit')

    def test_report_definition(self):
        self.assertEqual(self.report.name, 'Simplified Tax Report')
        self.assertEqual(self.report.country_id, self.env.ref('base.az'))
        self.assertEqual(self.report.root_report_id, self.env.ref('account.generic_tax_report'))
        self.assertEqual(self.report.availability_condition, 'country')
        self.assertEqual(self.report.default_opening_date_filter, 'previous_quarter')
        self.assertEqual(
            [(column.name, column.expression_label, column.figure_type) for column in self.report.column_ids],
            [('Amount', 'base', 'monetary')],
        )

    def test_line_structure(self):
        self.assertEqual(len(self.report.line_ids), 10)
        section = self.report.line_ids.filtered(lambda line: not line.code)
        self.assertEqual(section.name, 'Part 1 - Tax base and calculation')
        self.assertEqual(section.hierarchy_level, 0)
        self.assertFalse(section.expression_ids)
        coded_lines = self.report.line_ids - section
        self.assertEqual(sorted(coded_lines.mapped('code')), [f'az_sv{n}' for n in range(1, 10)])
        line_az_sv5 = self._get_line('az_sv5')
        self.assertEqual(line_az_sv5.parent_id, self._get_line('az_sv4'))
        self.assertEqual(line_az_sv5.hierarchy_level, 5)
        for line in coded_lines - line_az_sv5:
            self.assertFalse(line.parent_id, line.code)
            self.assertEqual(line.hierarchy_level, 3, line.code)

    def test_line_expressions(self):
        for code, (engine, formula, subformula) in EXPRESSIONS.items():
            expressions = self._get_line(code).expression_ids
            self.assertEqual(
                [(e.label, e.engine, e.formula, e.subformula or None) for e in expressions],
                [('base', engine, formula, subformula)],
            )

    def test_sv8_reuses_the_sv1_tag(self):
        expression = self._get_line('az_sv8').expression_ids
        self.assertEqual(expression._get_matching_tags(), self.env.ref('l10n_az.az_tag_sv1'))
        self.assertEqual(self.env.ref('l10n_az.az_tag_sv1').name, 'SV1')

    def _get_line(self, code):
        return self.report.line_ids.filtered(lambda line: line.code == code)


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestAzTitCustomEngine(AccountTestInvoicingCommon):
    chart_template = 'az'
    country_code = 'AZ'

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        chart_template = cls.env['account.chart.template'].with_company(cls.env.company)
        cls.income_account = chart_template.ref('az_account_60110')
        cls.other_income_account = chart_template.ref('az_account_61199')
        cls.receivable_account = chart_template.ref('az_account_21100')

    def _post_entry(self, date, credit_account, amount):
        move = self.env['account.move'].create({
            'move_type': 'entry',
            'date': date,
            'line_ids': [
                (0, 0, {'account_id': self.receivable_account.id, 'debit': amount, 'credit': 0.0}),
                (0, 0, {'account_id': credit_account.id, 'debit': 0.0, 'credit': amount}),
            ],
        })
        move.action_post()
        return move

    def test_month_income_engine(self):
        self._post_entry('2024-04-10', self.income_account, 100.0)
        self._post_entry('2024-05-10', self.income_account, 200.0)
        self._post_entry('2024-06-10', self.income_account, 300.0)
        # excluded: outside the quarter or not on an 'income' account
        self._post_entry('2024-07-05', self.income_account, 999.0)
        self._post_entry('2024-03-25', self.income_account, 999.0)
        self._post_entry('2024-04-15', self.other_income_account, 999.0)

        report = self.env.ref('l10n_az.tax_report_tit')
        options = {'date': {'date_to': '2024-06-30'}}
        self.assertEqual(report._l10n_az_tit_month_income(options, 1), 100.0)
        self.assertEqual(report._l10n_az_tit_month_income(options, 2), 200.0)
        self.assertEqual(report._l10n_az_tit_month_income(options, 3), 300.0)

        for month_index, expected in ((1, 100.0), (2, 200.0), (3, 300.0)):
            formula = f'_report_engine_l10n_az_tit_month{month_index}'
            expression = report.line_ids.expression_ids.filtered(lambda e: e.formula == formula)
            engine = getattr(report, formula)
            self.assertEqual(
                engine(options, 'strict_range', {formula: expression}, None),
                {expression: {'result': expected, 'has_sublines': False}},
            )
