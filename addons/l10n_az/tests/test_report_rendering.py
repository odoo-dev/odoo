from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from odoo.tests import tagged

# xmlid -> number of lines the report renders (all its lines, children included)
REPORTS = {
    'l10n_az.tax_report_vat': 36,
    'l10n_az.tax_report_withholding_tax': 25,
    'l10n_az.tax_report_tit': 10,
}


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestAzReportRendering(AccountTestInvoicingCommon):
    chart_template = 'az'
    country_code = 'AZ'

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.ensure_installed('account_reports')

    def test_reports_render(self):
        """ Opening any of the three Azerbaijani reports must not raise and must return its lines. """
        for xmlid, expected_line_count in REPORTS.items():
            with self.subTest(report=xmlid):
                report = self.env.ref(xmlid)
                options = report.get_options({
                    'selected_variant_id': report.id,
                    'date': {
                        'mode': 'range',
                        'filter': 'custom',
                        'date_from': '2024-01-01',
                        'date_to': '2024-03-31',
                    },
                })
                lines = report._get_lines(options)
                self.assertTrue(lines, xmlid)
                self.assertEqual(len(lines), expected_line_count, xmlid)
