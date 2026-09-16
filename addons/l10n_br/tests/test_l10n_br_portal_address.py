# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tests import HttpCase, tagged
from odoo.tools import mute_logger, urls

from odoo.addons.base.tests.common import BaseCommon


@tagged('-at_install', 'post_install')
class TestL10nBrPortalAddress(BaseCommon, HttpCase):

    def _submit(self, partner, **extra):
        self.authenticate('portal_user', 'portal_user')
        return self.url_open(urls.urljoin(self.base_url(), '/my/address/submit'), data={
            'csrf_token': self.csrf_token(),
            'partner_id': partner.id,
            'name': "Cliente Brasileiro",
            'email': 'cliente@example.com',
            'phone': '+5511999999999',
            'street_name': "Avenida Paulista",
            'street_number': '1578',
            'street2': "Bela Vista",
            'zip': '01310-200',
            'city_id': self.quick_ref('l10n_br.city_br_001').id,
            'country_id': self.quick_ref('base.br').id,
            **extra,
        }).json()

    @mute_logger('odoo.http')
    def test_br_billing_address_requires_cpf(self):
        """A Brazilian billing address is rejected without a CPF, and stores it as `BR_CN`."""
        partner = self._create_new_portal_user().partner_id
        res = self._submit(partner)
        self.assertIn('BR_CN', res['invalid_fields'])
        self.assertEqual(res['messages'], ["Some required fields are empty."])

        res = self._submit(partner, BR_CN='39053344705')
        self.assertEqual(res, {'redirectUrl': '/my/addresses'})
        self.assertEqual(partner.additional_identifiers, {'BR_CN': '39053344705'})

    @mute_logger('odoo.http')
    def test_br_billing_address_with_cnpj_needs_no_cpf(self):
        """A CNPJ rules the CPF out, so it is not required alongside one."""
        partner = self._create_new_portal_user().partner_id
        res = self._submit(partner, vat='16727230000197')
        self.assertEqual(res, {'redirectUrl': '/my/addresses'})
        self.assertEqual(partner.vat, '16727230000197')
        self.assertFalse(partner.additional_identifiers)
        self.assertTrue(partner._check_billing_address())

        # The VAT is not submitted when the B2B fields are hidden, and the stored one still exempts.
        res = self._submit(partner)
        self.assertEqual(res, {'redirectUrl': '/my/addresses'})
        self.assertFalse(partner.additional_identifiers)
