# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import odoo
from odoo import fields
from odoo.addons.payment.models.payment_acquirer import ValidationError
from odoo.addons.payment.tests.common import PaymentAcquirerCommon
from odoo.tools import mute_logger

from unittest.mock import patch
from . import stripe_mocks
from ..models.payment_acquirer import STRIPE_SIGNATURE_AGE_TOLERANCE
from lxml import objectify


class StripeCommon(PaymentAcquirerCommon):
    @classmethod
    def setUpClass(cls, chart_template_ref=None):
        super().setUpClass(chart_template_ref=chart_template_ref)
        cls.acquirer = cls.env['payment.acquirer'].sudo()
        cls.stripe = cls.env.ref('payment.payment_acquirer_stripe').sudo()
        cls.transaction = cls.env['payment.transaction'].sudo()
        cls.stripe.write({
            'stripe_secret_key': 'sk_test_KJtHgNwt2KS3xM7QJPr4O5E8',
            'stripe_publishable_key': 'pk_test_QSPnimmb4ZhtkEy3Uhdm4S6J',
            'stripe_webhook_secret': 'whsec_vG1fL6CMUouQ7cObF2VJprLVXT5jBLxB',
            'state': 'test',
        })
        cls.token = cls.env['payment.token'].sudo().create({
            'name': 'Test Card',
            'acquirer_id': cls.stripe.id,
            'acquirer_ref': 'cus_G27S7FqQ2w3fuH',
            'stripe_payment_method': 'pm_1FW3DdAlCFm536g8eQoSCejY',
            'partner_id': cls.buyer.id,
            'verified': True,
        })
        cls.tx = cls.transaction.create({
            'reference': 'stripe_test_10_%s' % fields.datetime.now().strftime('%Y%m%d_%H%M%S'),
            'currency_id': cls.currency_euro.id,
            'acquirer_id': cls.stripe.id,
            'partner_id': cls.buyer_id,
            'token_id': cls.token.id,
            'amount': 115.0
        })
        cls.ideal_icon = cls.env.ref("payment.payment_icon_cc_ideal")
        cls.bancontact_icon = cls.env.ref("payment.payment_icon_cc_bancontact")
        cls.p24_icon = cls.env.ref("payment.payment_icon_cc_p24")
        cls.eps_icon = cls.env.ref("payment.payment_icon_cc_eps")
        cls.giropay_icon = cls.env.ref("payment.payment_icon_cc_giropay")
        cls.all_icons = [cls.ideal_icon, cls.bancontact_icon, cls.p24_icon, cls.eps_icon, cls.giropay_icon]
        cls.stripe.write({'payment_icon_ids': [(5, 0, 0)]})


@odoo.tests.tagged('post_install', '-at_install', '-standard', 'external')
class StripeTest(StripeCommon):

    def run(self, result=None):
        with mute_logger('odoo.addons.payment.models.payment_acquirer', 'odoo.addons.payment_stripe.models.payment_acquirer'):
            StripeCommon.run(self, result)

    def test_20_stripe_form_render(self):
        self.assertEqual(self.stripe.state, 'test', 'test without test environment')
        stripe = self.stripe
        # be sure not to do stupid things
        self.assertEqual(stripe.state, 'test', 'test without test environment')

        # ----------------------------------------
        # Test: button direct rendering
        # ----------------------------------------

        reference = 'stripe_test_10_%s' % fields.Datetime.now().strftime('%Y%m%d_%H%M%S'),
        form_values = {
            'tx_url': 'https://api.stripe.com/v1/',
            'session_id': 'session_test',
            'stripe_key': self.stripe.stripe_publishable_key,
            'stripe_publishable_key': self.stripe.stripe_publishable_key,
        }
        res = stripe.redirect_form_view_id._render(form_values, engine='ir.qweb')
        # Create transaction
        tx = self.transaction.create({
            'reference': reference,
            'currency_id': self.currency_euro.id,
            'acquirer_id': self.stripe.id,
            'partner_id': self.buyer_id,
            'token_id': self.token.id,
            'amount': 115.0
        })
        rendering_values = tx._get_specific_rendering_values(dict(self.buyer_values, **{'amount': 2240.0, 'reference': 'SO004', 'acquirer_id': self.stripe.id, 'currency_id': self.currency_euro.id, 'partner_id': self.buyer_id}))
        form = stripe.redirect_form_view_id._render(
            rendering_values, engine='ir.qweb'
        )
        # check form result
        tree = objectify.fromstring(res)
        form = tree.xpath("//form")
        self.assertEqual(len(form), 1, 'Stripe: Found %d "data_set" input instead of 1' % len(form))
        for form_input in tree.input:
            if form_input.get('name') in ['submit']:
                continue
            self.assertEqual(
                form_input.get('value'),
                form_values[form_input.get('name')],
                'Stripe: wrong value for form input %s: received %s instead of %s' % (form_input.get('name'), form_input.get('value'), form_values[form_input.get('name')])
            )

    def test_30_stripe_form_management(self):
        self.assertEqual(self.stripe.state, 'test', 'test without test environment')
        ref = 'stripe_test_30_%s' % fields.datetime.now().strftime('%Y%m%d_%H%M%S')
        tx = self.transaction.create({
            'amount': 4700.0,
            'acquirer_id': self.stripe.id,
            'currency_id': self.currency_euro.id,
            'reference': ref,
            'partner_id': self.buyer_id,
            'partner_country_id': self.country_france.id,
            'token_id': self.token.id,
            'tokenize': True,
        })
        res = tx.with_context(off_session=True)._stripe_create_payment_intent()
        tx.stripe_payment_intent = res.get('payment_intent')

        # typical data posted by Stripe after client has successfully paid
        stripe_post_data = {'reference': ref}
        # validate it
        tx._handle_feedback_data('stripe', stripe_post_data)
        self.assertEqual(tx.state, 'done', 'Stripe: validation did not put tx into done state')
        self.assertTrue(bool(tx.acquirer_reference), "It should have set an acquirer reference")

    def test_add_available_payment_method_types_local_enabled(self):
        self.stripe.payment_icon_ids = [(6, 0, [i.id for i in self.all_icons])]
        tx_values = {
            'billing_partner_country': self.env.ref('base.be'),
            'currency_id': self.env.ref('base.EUR'),
            'operation': 'online_redirect',
            'tokenize': False,
        }
        stripe_session_data = {}

        self.tx._add_available_payment_method_types(stripe_session_data, tx_values)

        actual = {pmt for key, pmt in stripe_session_data.items() if key.startswith('payment_method_types')}
        self.assertEqual({'card', 'bancontact'}, actual)

    def test_add_available_payment_method_types_local_enabled_2(self):
        self.stripe.payment_icon_ids = [(6, 0, [i.id for i in self.all_icons])]
        tx_values = {
            'billing_partner_country': self.env.ref('base.pl'),
            'currency_id': self.env.ref('base.PLN'),
            'operation': 'online_redirect',
            'tokenize': False,
        }
        stripe_session_data = {}

        self.tx._add_available_payment_method_types(stripe_session_data, tx_values)

        actual = {pmt for key, pmt in stripe_session_data.items() if key.startswith('payment_method_types')}
        self.assertEqual({'card' , 'p24'}, actual)

    def test_add_available_payment_method_types_pmt_does_not_exist(self):
        self.bancontact_icon.sudo().unlink()
        tx_values = {
            'billing_partner_country': self.env.ref('base.be'),
            'currency_id': self.env.ref('base.EUR'),
            'operation': 'online_redirect',
            'tokenize': False,
        }
        stripe_session_data = {}

        self.tx._add_available_payment_method_types(stripe_session_data, tx_values)

        actual = {pmt for key, pmt in stripe_session_data.items() if key.startswith('payment_method_types')}
        self.assertEqual({'card', 'bancontact'}, actual)

    def test_add_available_payment_method_types_local_disabled(self):
        tx_values = {
            'billing_partner_country': self.env.ref('base.be'),
            'currency_id': self.env.ref('base.EUR'),
            'operation': 'online_redirect',
            'tokenize': False,
        }
        stripe_session_data = {}

        self.tx._add_available_payment_method_types(stripe_session_data, tx_values)

        actual = {pmt for key, pmt in stripe_session_data.items() if key.startswith('payment_method_types')}
        self.assertEqual({'card'}, actual)

    def test_add_available_payment_method_types_local_all_but_bancontact(self):
        self.stripe.payment_icon_ids = [(4, icon.id) for icon in self.all_icons if icon.name.lower() != 'bancontact']
        tx_values = {
            'billing_partner_country': self.env.ref('base.be'),
            'currency_id': self.env.ref('base.EUR'),
            'operation': 'online_redirect',
            'tokenize': False,
        }
        stripe_session_data = {}

        self.tx._add_available_payment_method_types(stripe_session_data, tx_values)

        actual = {pmt for key, pmt in stripe_session_data.items() if key.startswith('payment_method_types')}
        self.assertEqual({'card'}, actual)

    def test_add_available_payment_method_types_recurrent(self):
        tx_values = {
            'billing_partner_country': self.env.ref('base.be'),
            'currency_id': self.env.ref('base.EUR'),
            'operation': 'online_redirect',
            'tokenize': True,
        }
        stripe_session_data = {}

        self.tx._add_available_payment_method_types(stripe_session_data, tx_values)

        actual = {pmt for key, pmt in stripe_session_data.items() if key.startswith('payment_method_types')}
        self.assertEqual({'card'}, actual)

    def test_discarded_webhook(self):
        self.assertFalse(self.transaction._handle_stripe_webhook(dict(type='payment.intent.succeeded')))

    def test_handle_checkout_webhook_no_secret(self):
        self.stripe.stripe_webhook_secret = None

        with self.assertRaises(ValidationError):
            self.transaction._handle_stripe_webhook(dict(type='checkout.session.completed'))

    @patch('odoo.addons.payment_stripe.models.payment_acquirer.request')
    @patch('odoo.addons.payment_stripe.models.payment_acquirer.datetime')
    def test_handle_checkout_webhook(self, dt, request):
        # pass signature verification
        dt.utcnow.return_value.timestamp.return_value = 1591264652
        request.httprequest.headers = {'Stripe-Signature': stripe_mocks.checkout_session_signature}
        request.httprequest.data = stripe_mocks.checkout_session_body
        # test setup
        tx = self.transaction.create({
            'reference': 'tx_ref_test_handle_checkout_webhook',
            'currency_id': self.currency_euro.id,
            'acquirer_id': self.stripe.id,
            'partner_id': self.buyer_id,
            'token_id': self.token.id,
            'operation': 'offline',
            'tokenize': True,
            'amount': 30
        })
        res = tx.with_context(off_session=True)._stripe_create_payment_intent()
        tx.stripe_payment_intent = res.get('payment_intent')
        stripe_object = stripe_mocks.checkout_session_object

        actual = self.transaction._handle_checkout_webhook(stripe_object)

        self.assertTrue(actual)

    @patch('odoo.addons.payment_stripe.models.payment_acquirer.request')
    @patch('odoo.addons.payment_stripe.models.payment_acquirer.datetime')
    def test_handle_checkout_webhook_wrong_amount(self, dt, request):
        # pass signature verification
        dt.utcnow.return_value.timestamp.return_value = 1591264652
        request.httprequest.headers = {'Stripe-Signature': stripe_mocks.checkout_session_signature}
        request.httprequest.data = stripe_mocks.checkout_session_body
        # test setup
        bad_tx = self.transaction.create({
            'reference': 'tx_ref_test_handle_checkout_webhook_wrong_amount',
            'currency_id': self.currency_euro.id,
            'acquirer_id': self.stripe.id,
            'partner_id': self.buyer_id,
            'token_id': self.token.id,
            'operation': 'offline',
            'tokenize': True,
            'amount': 10
        })
        wrong_amount_stripe_payment_intent = bad_tx.with_context(off_session=True)._stripe_create_payment_intent()
        tx = self.transaction.create({
            'reference': 'tx_ref_test_handle_checkout_webhook',
            'currency_id': self.currency_euro.id,
            'acquirer_id': self.stripe.id,
            'partner_id': self.buyer_id,
            'token_id': self.token.id,
            'operation': 'offline',
            'tokenize': True,
            'amount': 30
        })
        tx.stripe_payment_intent = wrong_amount_stripe_payment_intent.get('payment_intent')
        stripe_object = stripe_mocks.checkout_session_object

        actual = self.env['payment.transaction']._handle_checkout_webhook(stripe_object)

        self.assertFalse(actual)

    def test_handle_checkout_webhook_no_odoo_tx(self):
        stripe_object = stripe_mocks.checkout_session_object

        actual = self.transaction._handle_checkout_webhook(stripe_object)

        self.assertFalse(actual)

    @patch('odoo.addons.payment_stripe.models.payment_acquirer.request')
    @patch('odoo.addons.payment_stripe.models.payment_acquirer.datetime')
    def test_handle_checkout_webhook_no_stripe_tx(self, dt, request):
        # pass signature verification
        dt.utcnow.return_value.timestamp.return_value = 1591264652
        request.httprequest.headers = {'Stripe-Signature': stripe_mocks.checkout_session_signature}
        request.httprequest.data = stripe_mocks.checkout_session_body
        # test setup
        self.transaction.create({
            'reference': 'tx_ref_test_handle_checkout_webhook',
            'currency_id': self.currency_euro.id,
            'acquirer_id': self.stripe.id,
            'partner_id': self.buyer_id,
            'token_id': self.token.id,
            'operation': 'offline',
            'tokenize': True,
            'amount': 30
        })
        stripe_object = stripe_mocks.checkout_session_object

        with self.assertRaises(ValidationError):
            self.transaction._handle_checkout_webhook(stripe_object)

    @patch('odoo.addons.payment_stripe.models.payment_acquirer.request')
    @patch('odoo.addons.payment_stripe.models.payment_acquirer.datetime')
    def test_verify_stripe_signature(self, dt, request):
        dt.utcnow.return_value.timestamp.return_value = 1591264652
        request.httprequest.headers = {'Stripe-Signature': stripe_mocks.checkout_session_signature}
        request.httprequest.data = stripe_mocks.checkout_session_body

        actual = self.stripe._verify_stripe_signature()

        self.assertTrue(actual)

    @patch('odoo.addons.payment_stripe.models.payment_acquirer.request')
    @patch('odoo.addons.payment_stripe.models.payment_acquirer.datetime')
    def test_verify_stripe_signature_tampered_body(self, dt, request):
        dt.utcnow.return_value.timestamp.return_value = 1591264652
        request.httprequest.headers = {'Stripe-Signature': stripe_mocks.checkout_session_signature}
        request.httprequest.data = stripe_mocks.checkout_session_body.replace(b'1500', b'10')

        with self.assertRaises(ValidationError):
            self.stripe._verify_stripe_signature()

    @patch('odoo.addons.payment_stripe.models.payment_acquirer.request')
    @patch('odoo.addons.payment_stripe.models.payment_acquirer.datetime')
    def test_verify_stripe_signature_wrong_secret(self, dt, request):
        dt.utcnow.return_value.timestamp.return_value = 1591264652
        request.httprequest.headers = {'Stripe-Signature': stripe_mocks.checkout_session_signature}
        request.httprequest.data = stripe_mocks.checkout_session_body
        self.stripe.write({
            'stripe_webhook_secret': 'whsec_vG1fL6CMUouQ7cObF2VJprL_TAMPERED',
        })

        with self.assertRaises(ValidationError):
            self.stripe._verify_stripe_signature()

    @patch('odoo.addons.payment_stripe.models.payment_acquirer.request')
    @patch('odoo.addons.payment_stripe.models.payment_acquirer.datetime')
    def test_verify_stripe_signature_too_old(self, dt, request):
        dt.utcnow.return_value.timestamp.return_value = 1591264652 + STRIPE_SIGNATURE_AGE_TOLERANCE + 1
        request.httprequest.headers = {'Stripe-Signature': stripe_mocks.checkout_session_signature}
        request.httprequest.data = stripe_mocks.checkout_session_body

        with self.assertRaises(ValidationError):
            self.stripe._verify_stripe_signature()
