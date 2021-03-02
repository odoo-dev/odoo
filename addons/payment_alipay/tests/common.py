# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.addons.payment.tests.common import PaymentCommon


class AlipayCommon(PaymentCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.currency_yuan = cls._prepare_currency('CNY')
        cls.alipay = cls._prepare_acquirer('alipay', values={
            'alipay_merchant_partner_id': 'dummy',
            'alipay_md5_signature_key': 'dummy',
            'alipay_seller_email': 'dummy',
            'fees_active': False, # Only activate fees in dedicated tests
        })

        # override defaults for helpers
        cls.acquirer = cls.alipay
        cls.currency = cls.currency_yuan
