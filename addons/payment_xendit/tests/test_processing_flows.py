# Part of Odoo. See LICENSE file for full copyright and licensing details.

from unittest.mock import patch

from werkzeug.exceptions import Forbidden

from odoo.tests import tagged
from odoo.tools import mute_logger

from odoo.addons.payment.tests.http_common import PaymentHttpCommon
from odoo.addons.payment_xendit.controllers.main import XenditController
from odoo.addons.payment_xendit.tests.common import XenditCommon


@tagged('post_install', '-at_install')
class TestProcessingFlow(XenditCommon, PaymentHttpCommon):
    @mute_logger('odoo.addons.payment_xendit.controllers.main')
    def test_webhook_notification_triggers_signature_verification(self):
        """When webhook data is received, make sure to do signature verification"""
        self._create_transaction('redirect', reference='TEST0001')
        url = self._build_url(XenditController._webhook_url)
        with patch('odoo.addons.payment_xendit.controllers.main.XenditController.'
                   '_xendit_verify_notification_signature'
                   ) as verify_signature_mock:
            self._make_json_request(url, data=self.webhook_notification_data_invoice)
        self.assertEqual(verify_signature_mock.call_count, 1)

    @mute_logger('odoo.addons.payment_xendit.controllers.main')
    def test_webhook_notification_no_signature_deny(self):
        """When a webhook data is received but no signature is found, there should be an issue such that the data is never processed"""
        self._create_transaction('redirect', reference='TEST0001')
        url = self._build_url(XenditController._webhook_url)
        with patch(
            'odoo.addons.payment.models.payment_transaction.PaymentTransaction'
            '._handle_notification_data'
        ) as handle_notification_mock:
            self._make_json_request(url, data=self.webhook_notification_data_invoice)
        handle_notification_mock.assert_not_called()

    @mute_logger('odoo.addons.payment_xendit.controllers.main')
    def test_webhook_notification_triggers_processing(self):
        """ Test that receiving a valid webhook notification and signature verified triggers the processing of the
        notification data. """
        self._create_transaction('direct', reference='TEST0001')
        url = self._build_url(XenditController._webhook_url)
        with patch(
            'odoo.addons.payment_xendit.controllers.main.XenditController.'
            '_xendit_verify_notification_signature'
        ), patch(
            'odoo.addons.payment.models.payment_transaction.PaymentTransaction'
            '._handle_notification_data'
        ) as handle_notification_data_mock:
            self._make_json_request(url, data=self.webhook_notification_data_invoice)
        self.assertEqual(handle_notification_data_mock.call_count, 1)

    @mute_logger('odoo.addons.payment_xendit.controllers.main')
    def test_reject_notification_with_invalid_signature(self):
        """ Test the verification of a notification with an invalid signature. Forbidden should be raised """
        tx = self._create_transaction('redirect')

        self.assertRaises(
            Forbidden,
            XenditController._xendit_verify_notification_signature,
            'bad_signature',
            tx,
        )

    @mute_logger('odoo.addons.payment_xendit.controllers.main')
    def test_no_error_after_signature(self):
        """If the signature is valid, should not be raising any exceptions"""
        tx = self._create_transaction('redirect')

        self._assert_does_not_raise(
            Forbidden,
            XenditController._xendit_verify_notification_signature,
            'xnd_wbhook_token',
            tx,
        )
