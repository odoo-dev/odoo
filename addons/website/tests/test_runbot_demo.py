# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo.tests import tagged, TransactionCase


@tagged('post_install', '-at_install')
class TestRunbotDemo(TransactionCase):
    """Simple test to verify Runbot detects and executes website tests."""

    def test_website_exists(self):
        """Check that a default website record exists."""
        website = self.env['website'].search([], limit=1)
        self.assertTrue(website, "At least one website should exist")
        self.assertTrue(website.name, "Website should have a name")

    def test_math(self):
        """Basic Math"""
        self.assertEqual(1, 2, "1 is not equals to 2")

    def test_website_page_creation(self):
        """Check that we can create a simple website page."""
        website = self.env['website'].search([], limit=1)
        page = self.env['website.page'].create({
            'name': 'Runbot Demo Page',
            'url': '/runbot-demo-test',
            'website_id': website.id,
            'view_id': self.env['ir.ui.view'].create({
                'name': 'Runbot Demo View',
                'type': 'qweb',
                'arch': '<t t-name="runbot_demo"><div>Hello Runbot!</div></t>',
            }).id,
        })
        self.assertEqual(page.name, 'Runbot Demo Page')
        self.assertEqual(page.url, '/runbot-demo-test')
