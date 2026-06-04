# Part of Odoo. See LICENSE file for full copyright and licensing details.

import odoo.tests
from odoo.tests import patch
from odoo.tests.common import TEST_CURSOR_COOKIE_NAME, release_test_lock

from odoo.addons.base_report_paper_muncher.paper_muncher import paper_muncher


@odoo.tests.tagged('post_install', '-at_install')
class TestPaperMuncherReport(odoo.tests.HttpCase):

    def setUp(self):
        super().setUp()
        if paper_muncher().state != 'ok':
            self.skipTest("paper-muncher binary not found")

        self.report = self.env['ir.actions.report'].create({
            'name': 'Test Paper Muncher Report',
            'model': 'res.partner',
            'report_name': 'base_report_paper_muncher.test_report_partner',
            'report_type': 'qweb-pdf-paper-muncher',
            'paperformat_id': self.env.ref('base.paperformat_euro').id,
        })
        self.env['ir.ui.view'].create({
            'type': 'qweb',
            'name': 'base_report_paper_muncher.test_report_partner',
            'key': 'base_report_paper_muncher.test_report_partner',
            'arch': '''
                <t t-name="base_report_paper_muncher.test_report_partner">
                    <t t-call="web.html_container">
                        <t t-foreach="docs" t-as="o">
                            <div class="article">
                                <div class="page">
                                    <p>Name: <t t-out="o.name"/></p>
                                </div>
                            </div>
                        </t>
                    </t>
                </t>
            ''',
        })
        self.partners = self.env['res.partner'].create([
            {'name': 'PM Test Partner 1'},
            {'name': 'PM Test Partner 2'},
        ])

        # Mirror what HttpCase does for _run_wkhtmltopdf: set the test cursor key,
        # release the registry lock so _handle_fallback can open a TestCursor, and
        # inject the matching cookie into every fallback environ so Odoo's asset
        # routes pass assertCanOpenTestCursor.
        case_instance = self
        report_model = self.env.registry['ir.actions.report']
        old_run = report_model._run_paper_muncher

        def _patched_run_paper_muncher(self_report, bodies, **kwargs):
            with (
                patch.object(case_instance, 'http_request_key', 'paper-muncher'),
                release_test_lock(),
                patch('odoo.tests.common._disable_flushing_cursor', True),
            ):
                return old_run(
                    self_report, bodies,
                    extra_environ={'HTTP_COOKIE': f'{TEST_CURSOR_COOKIE_NAME}=paper-muncher'},
                    **kwargs,
                )

        self.startPatcher(patch.object(
            report_model,
            '_run_paper_muncher',
            _patched_run_paper_muncher,
        ))

    def _render_pdf(self, partner_ids):
        return self.env['ir.actions.report'].with_context(
            force_report_rendering=True,
        )._render_qweb_pdf(self.report, partner_ids)[0]

    def test_render_single_document(self):
        pdf = self._render_pdf([self.partners[0].id])
        self.assertTrue(pdf.startswith(b'%PDF-'), "Expected a valid PDF")

    def test_render_multiple_documents(self):
        pdf = self._render_pdf(self.partners.ids)
        self.assertTrue(pdf.startswith(b'%PDF-'), "Expected a valid PDF")