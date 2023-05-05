# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tests import tagged
from odoo.tests.common import TransactionCase

from odoo.addons.base.tests.common import HttpCaseWithUserPortal


@tagged('post_install', '-at_install')
class TestWebsiteSaleCartRecoveryServer(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.customer = cls.env['res.partner'].create({
            'name': 'a',
            'email': 'a@example.com',
        })
        cls.recovery_template_default = cls.env.ref('website_sale.mail_template_sale_cart_recovery')
        cls.recovery_template_custom1 = cls.recovery_template_default.copy()
        cls.recovery_template_custom2 = cls.recovery_template_default.copy()

        cls.website0 = cls.env['website'].create({
            'name': 'web0',
            'cart_recovery_mail_template_id': cls.recovery_template_default.id,
        })
        cls.website1 = cls.env['website'].create({
            'name': 'web1',
            'cart_recovery_mail_template_id': cls.recovery_template_custom1.id,
        })
        cls.website2 = cls.env['website'].create({
            'name': 'web2',
            'cart_recovery_mail_template_id': cls.recovery_template_custom2.id,
        })
        cls.so0 = cls.env['sale.order'].create({
            'partner_id': cls.customer.id,
            'website_id': cls.website0.id,
            'is_abandoned_cart': True,
            'cart_recovery_email_sent': False,
        })
        cls.so1 = cls.env['sale.order'].create({
            'partner_id': cls.customer.id,
            'website_id': cls.website1.id,
            'is_abandoned_cart': True,
            'cart_recovery_email_sent': False,
        })
        cls.so2 = cls.env['sale.order'].create({
            'partner_id': cls.customer.id,
            'website_id': cls.website2.id,
            'is_abandoned_cart': True,
            'cart_recovery_email_sent': False,
        })

    def test_cart_recovery_mail_template(self):
        """Make sure that we get the correct cart recovery templates to send."""
        self.assertEqual(
            self.so1._get_cart_recovery_template(),
            self.recovery_template_custom1,
            "We do not return the correct mail template"
        )
        self.assertEqual(
            self.so2._get_cart_recovery_template(),
            self.recovery_template_custom2,
            "We do not return the correct mail template"
        )
        # Orders that belong to different websites; we should get the default template
        self.assertEqual(
            (self.so1 + self.so2)._get_cart_recovery_template(),
            self.recovery_template_default,
            "We do not return the correct mail template"
        )

    def test_cart_recovery_mail_template_send(self):
        """The goal of this test is to make sure cart recovery works."""
        orders = self.so0 + self.so1 + self.so2

        self.assertFalse(
            any(orders.mapped('cart_recovery_email_sent')),
            "The recovery mail should not have been sent yet."
        )
        self.assertFalse(
            any(orders.mapped('access_token')),
            "There should not be an access token yet."
        )

        orders._cart_recovery_email_send()

        self.assertTrue(
            all(orders.mapped('cart_recovery_email_sent')),
            "The recovery mail should have been sent."
        )
        self.assertTrue(
            all(orders.mapped('access_token')),
            "All tokens should have been generated."
        )

        sent_mail = {}
        for order in orders:
            mail = self.env["mail.mail"].search([
                ('record_name', '=', order['name'])
            ])
            sent_mail.update({order: mail})

        self.assertTrue(
            all(len(sent_mail[order]) == 1 for order in orders),
            "Each cart recovery mail has been sent exactly once."
        )
