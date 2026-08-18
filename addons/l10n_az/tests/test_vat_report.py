from lxml import etree

from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from odoo.tests import TransactionCase, tagged
from odoo.tools import file_path

REPORT_DATA_FILE = 'l10n_az/data/account_tax_report_vat_data.xml'

TAX_TAGS_EXPRESSIONS = {
    'az_101': {'base': '-1(B)', 'tax': '-1(T)'},
    'az_102': {'base': '-2(B)', 'tax': '-2(T)'},
    'az_112': {'base': '-3(B)', 'tax': '-3(T)'},
    'az_2': {'base': '-4(B)'},
    'az_3': {'base': '-5(B)'},
    'az_4': {'base': '-6(B)', 'tax': '-6(T)'},
    'az_601': {'base': '-7(B)', 'tax': '-7(T)'},
    'az_602': {'base': '-8(B)'},
    'az_701': {'rec': '-9(B)'},
    'az_702': {'base': '-10(B)'},
    'az_703': {'base': '-11(B)'},
    'az_8': {'base': '12(B)', 'tax': '12(T)'},
    'az_9': {'base': '13(B)', 'tax': '13(T)'},
    'az_10': {'base': '14(B)', 'tax': '14(T)'},
    'az_11': {'base': '15(B)'},
    'az_12': {'base': '16(B)', 'tax': '16(T)'},
    'az_13': {'tax': '17(T)'},
    'az_14': {'tax': '18(T)'},
    'az_15': {'tax': '19(T)'},
    'az_16': {'base': '20(B)'},
    'az_18': {'base': '21(B)', 'tax': '21(T)'},
    'az_21': {'tax': '22(T)'},
}
AGGREGATION_EXPRESSIONS = {
    'az_1': {'base': 'az_101.base+az_102.base', 'tax': 'az_101.tax+az_102.tax'},
    'az_5': {
        'base': 'az_1.base+az_112.base+az_2.base+az_3.base+az_4.base',
        'tax': 'az_1.tax+az_112.tax+az_4.tax',
    },
    'az_6': {'base': 'az_601.base+az_602.base', 'tax': 'az_601.tax'},
    'az_7': {'base': 'az_701.base+az_702.base+az_703.base'},
    'az_701': {'ta': '-(az_1.base + az_112.base)', 'base': 'az_701.rec + az_701.ta'},
    'az_17': {
        'base': 'az_8.base+az_9.base+az_10.base+az_11.base+az_12.base+az_16.base',
        'tax': 'az_8.tax+az_9.tax+az_10.tax+az_12.tax-az_13.tax-az_15.tax',
    },
    'az_25': {'tax': 'az_5.tax+az_6.tax+az_18.tax+az_21.tax-az_17.tax'},
}
CODED_LINES = [
    'az_1', 'az_101', 'az_102', 'az_112', 'az_2', 'az_3', 'az_4', 'az_5', 'az_6', 'az_601',
    'az_602', 'az_7', 'az_701', 'az_702', 'az_703', 'az_8', 'az_9', 'az_10', 'az_11', 'az_12',
    'az_13', 'az_14', 'az_15', 'az_16', 'az_17', 'az_18', 'az_19', 'az_20', 'az_21', 'az_25',
]


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestAzVatReport(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.report = cls.env.ref('l10n_az.tax_report_vat')
        cls.country_az = cls.env.ref('base.az')

    def test_report_definition(self):
        self.assertEqual(self.report.name, 'VAT Report')
        self.assertEqual(self.report.country_id, self.country_az)
        self.assertEqual(self.report.root_report_id, self.env.ref('account.generic_tax_report'))
        self.assertEqual(self.report.availability_condition, 'country')
        self.assertTrue(self.report.allow_foreign_vat)

    def test_report_columns(self):
        self.assertEqual(
            [(column.name, column.expression_label, column.figure_type) for column in self.report.column_ids],
            [('Taxable Turnover excl. VAT', 'base', 'monetary'), ('VAT Amount', 'tax', 'monetary')],
        )

    def test_line_structure(self):
        self.assertEqual(len(self.report.line_ids), 36)
        sections = self.report.line_ids.filtered(lambda line: not line.code)
        self.assertEqual(len(sections), 6)
        self.assertEqual(set(sections.mapped('hierarchy_level')), {0})
        self.assertFalse(sections.expression_ids)
        coded_lines = self.report.line_ids - sections
        self.assertEqual(sorted(coded_lines.mapped('code')), sorted(CODED_LINES))
        line_az_1 = self._get_line('az_1')
        self.assertEqual(line_az_1.hierarchy_level, 3)
        self.assertEqual(line_az_1.foldability, 'foldable')
        self.assertEqual(line_az_1.children_ids.mapped('code'), ['az_101', 'az_102'])
        self.assertEqual(line_az_1.children_ids.mapped('hierarchy_level'), [5, 5])
        for line in coded_lines - line_az_1.children_ids - line_az_1:
            self.assertFalse(line.parent_id, line.code)
            self.assertEqual(line.hierarchy_level, 3, line.code)

    def test_tag_expressions(self):
        for code, expected in TAX_TAGS_EXPRESSIONS.items():
            line = self._get_line(code)
            for label, formula in expected.items():
                expression = line.expression_ids.filtered(lambda e: e.label == label)
                self.assertEqual(expression.engine, 'tax_tags', f'{code}.{label}')
                self.assertEqual(expression.formula, formula, f'{code}.{label}')
                self.assertEqual(len(expression._get_matching_tags()), 1, f'{code}.{label}')

    def test_aggregation_expressions(self):
        for code, expected in AGGREGATION_EXPRESSIONS.items():
            line = self._get_line(code)
            for label, formula in expected.items():
                expression = line.expression_ids.filtered(lambda e: e.label == label)
                self.assertEqual(expression.engine, 'aggregation', f'{code}.{label}')
                self.assertEqual(expression.formula, formula, f'{code}.{label}')

    def test_external_expressions(self):
        for code in ('az_19', 'az_20'):
            expressions = self._get_line(code).expression_ids
            self.assertEqual(
                [(e.label, e.engine, e.formula, e.subformula) for e in expressions],
                [('base', 'external', 'most_recent', 'editable;rounding=2')],
            )

    def test_azerbaijani_labels_in_data_file(self):
        """ name@az is skipped at load time by convert.py, so it is asserted on the file itself. """
        tree = etree.parse(file_path(REPORT_DATA_FILE))
        report_node = tree.find('.//record[@model="account.report"]')
        self.assertEqual(
            report_node.findtext('field[@name="name@az"]'),
            'Əlavə Dəyər Vergisi Bəyannaməsi',
        )
        translations = {}
        for record in tree.iterfind('.//record[@model="account.report.line"]'):
            translations[record.findtext('field[@name="code"]')] = record.findtext('field[@name="name@az"]')
        self.assertEqual(len(translations), 31)  # 30 coded lines + the sections (no code)
        self.assertEqual(translations['az_101'], 'Malların təqdim edilməsi, işlərin görülməsi, xidmətlərin göstərilməsi üzrə əməliyyatlar')
        self.assertEqual(translations['az_25'], 'BÜDCƏYƏ ÖDƏNİLMƏLİDİR / BÜDCƏDƏN QAYTARILIR')

    def _get_line(self, code):
        return self.report.line_ids.filtered(lambda line: line.code == code)


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestAzVatReportFlows(AccountTestInvoicingCommon):
    chart_template = 'az'
    country_code = 'AZ'

    def test_default_sale_tax_cash_basis_flow(self):
        """ The 18% group defers the 1(B)/1(T) grids to payment time while 9(B) fires at invoice time. """
        chart_template = self.env['account.chart.template'].with_company(self.env.company)
        group_tax = chart_template.ref('az_tax_sale_vat_18_group')
        self.assertEqual(self.env.company.account_sale_tax_id, group_tax)
        self.assertEqual(group_tax.amount_type, 'group')
        self.assertEqual(
            group_tax.children_tax_ids,
            chart_template.ref('az_tax_sale_vat_18') + chart_template.ref('az_tax_sale_vat_18_r'),
        )

        invoice = self.init_invoice('out_invoice', amounts=[1000], taxes=group_tax, invoice_date='2024-01-15', post=True)
        base_line = invoice.invoice_line_ids
        self.assertIn('9(B)', base_line.tax_tag_ids.mapped('name'))
        self.assertNotIn('1(B)', base_line.tax_tag_ids.mapped('name'))
        tax_line = invoice.line_ids.filtered('tax_line_id')
        self.assertEqual(tax_line.account_id.code, '52120')
        self.assertEqual(tax_line.balance, -180.0)
        self.assertFalse(tax_line.tax_tag_ids)
        receivable_line = invoice.line_ids.filtered(lambda line: line.account_id.account_type == 'asset_receivable')
        self.assertEqual(receivable_line.account_id.code, '21100')
        self.assertEqual(receivable_line.balance, 1180.0)

        self.env['account.payment.register'].with_context(
            active_model='account.move', active_ids=invoice.ids,
        ).create({'payment_date': '2024-01-20'})._create_payments()
        self.assertEqual(invoice.payment_state, 'paid')

        caba_move = self.env['account.move'].search([('tax_cash_basis_origin_move_id', '=', invoice.id)])
        self.assertEqual(len(caba_move), 1)
        transition_line = caba_move.line_ids.filtered(lambda line: line.account_id.code == '52120')
        self.assertEqual(transition_line.balance, 180.0)
        final_tax_line = caba_move.line_ids.filtered(lambda line: line.account_id.code == '52110')
        self.assertEqual(final_tax_line.balance, -180.0)
        self.assertEqual(final_tax_line.tax_tag_ids.mapped('name'), ['1(T)'])
        caba_base_lines = caba_move.line_ids.filtered(lambda line: '1(B)' in line.tax_tag_ids.mapped('name'))
        self.assertTrue(caba_base_lines)
        self.assertEqual({abs(line.balance) for line in caba_base_lines}, {1000.0})
