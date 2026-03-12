import datetime

from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestShellAuditHistory(TransactionCase):
    def test_overview_uses_comment(self):
        h = self.env['shell.audit.history'].sudo().create({
            'comment': 'my comment',
            'source': 'source line',
        })
        self.assertEqual(h.overview, 'my comment')

    def test_overview_falls_back_to_source(self):
        h = self.env['shell.audit.history'].sudo().create({
            'source': 'first line\nsecond line',
        })
        self.assertIn('first line', h.overview)

    def test_overview_truncates_at_4_lines(self):
        lines = ['line %d' % i for i in range(10)]
        h = self.env['shell.audit.history'].sudo().create({
            'source': '\n'.join(lines)},
        )
        self.assertTrue(h.overview.endswith('\n...'))
        shown = h.overview.rstrip('\n...').splitlines()
        self.assertEqual(len(shown), 4)
