from odoo.fields import Command
from odoo.tests import HttpCase, tagged

from odoo.addons.account.tests.common import AccountTestInvoicingCommon


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestL10nEcWebsiteSaleCheckout(AccountTestInvoicingCommon, HttpCase):

    @classmethod
    @AccountTestInvoicingCommon.setup_country('ec')
    def setUpClass(cls):
        super().setUpClass()
        cls.website = cls.env['website'].sudo().create({
            'name': 'EC Website',
            'company_id': cls.company_data['company'].id,
            'domain': cls.base_url(),
        })
        cls.env.ref('website_sale.address_b2b').sudo().active = False
        cls.product = cls.env['product.product'].sudo().create({
            'name': 'Product', 'type': 'service', 'list_price': 50, 'taxes_id': False,
            'is_published': True,
        })

    def _submit_billing(self, login, **extra):
        user = self._create_new_portal_user(login=login)
        cart = self.env['sale.order'].sudo().create({
            'partner_id': user.partner_id.id,
            'website_id': self.website.id,
            'order_line': [Command.create({'product_id': self.product.id})],
        })
        self.authenticate(user.login, user.login, session_extra={'sale_order_id': cart.id})
        res = self.url_open('/shop/address/submit', data={
            'csrf_token': self.csrf_token(),
            'partner_id': user.partner_id.id,
            'address_type': 'billing',
            'name': "Juan Perez",
            'email': 'juan@example.com',
            'phone': '+593991234567',
            'street': "Av. Amazonas 123",
            'city': "Quito",
            'zip': '170135',
            'country_id': self.env.ref('base.ec').id,
            'state_id': self.env.ref('base.state_ec_17').id,
            **extra,
        }).json()
        return user.partner_id, res

    def test_cedula_required_above_final_consumer_limit(self):
        """Strictly above the limit a Cédula is required, and a cart crossing it later bounces."""
        partner, res = self._submit_billing('at_limit')
        self.assertNotIn('invalid_fields', res)
        self.assertFalse(partner.vat or partner.additional_identifiers)
        payment = self.url_open('/shop/payment', allow_redirects=False)
        self.assertNotIn('/shop/address', payment.headers.get('Location', ''))

        self.website.l10n_ec_final_consumer_limit = 49.99
        res = self.url_open('/shop/payment', allow_redirects=False)
        self.assertIn(f'partner_id={partner.id}&address_type=billing', res.headers['Location'])
        self.assertEqual(partner.sale_order_ids.alerts, [{
            'level': 'warning',
            'message': "Your order exceeds the maximum amount for an unidentified final consumer."
            " Please provide your identification number.",
        }])

        _partner, res = self._submit_billing('over_limit')
        self.assertEqual(res['invalid_fields'], ['EC_DNI'])
        _partner, res = self._submit_billing('cedula', EC_DNI='1714616123')
        self.assertNotIn('invalid_fields', res)
