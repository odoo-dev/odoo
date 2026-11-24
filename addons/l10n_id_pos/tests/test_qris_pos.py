from datetime import timedelta

from odoo import fields
from odoo.exceptions import ValidationError
from odoo.tests import tagged
from odoo.addons.point_of_sale.tests.test_frontend import TestPointOfSaleHttpCommon
from unittest.mock import patch
from freezegun import freeze_time


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestPosQris(TestPointOfSaleHttpCommon):
    """ Testing QRIS payment via PoS """
    _test_user_groups = None  # FIXME list needed groups

    @classmethod
    @TestPointOfSaleHttpCommon.setup_chart_template('id')
    def setUpClass(cls):
        super().setUpClass()
        cls.company_data['company'].qr_code = True
        cls.company_data['company'].partner_id.update({
            'country_id': cls.env.ref('base.id').id,
            'city': 'Jakarta',
        })

        cls.acc_qris_id = cls.env['res.partner.bank'].create({
            'account_number': '123456789012345678',
            'partner_id': cls.company_data['company'].partner_id.id,
            'l10n_id_qris_api_key': 'apikey',
            'l10n_id_qris_mid': 'mid',
        })

        cls.env['product.combo.item'].search([]).unlink()
        cls.env['product.product'].search([]).write({'available_in_pos': False})

        cls.product_1 = cls.env['product.product'].create({
            'name': 'Test Product',
            'available_in_pos': True,
            'list_price': 1000,
            'taxes_id': False,
        })

        # Create user.
        cls.qris_pos_user = cls.env['res.users'].create({
            'name': 'A simple PoS man!',
            'login': 'qris_pos_user',
            'password': 'qris_pos_user',
            'group_ids': [
                (4, cls.env.ref('base.group_user').id),
                (4, cls.env.ref('point_of_sale.group_pos_user').id),
                (4, cls.env.ref('account.group_account_invoice').id),
            ],
        })

        cls.company = cls.company_data['company']
        cls.pos_receivable_bank = cls.copy_account(cls.company.account_default_pos_receivable_account_id, {'name': 'POS Receivable Bank'})
        cls.outstanding_bank = cls.copy_account(cls.outbound_payment_method_line.payment_account_id, {'name': 'Outstanding Bank'})

        cls.company_data['default_journal_bank'].write({'bank_account_id': cls.acc_qris_id.id})

        cls.bank_pm = cls.env['pos.payment.method'].sudo().create({
            'name': 'Cash',
            'type': 'cash',
            'journal_id': cls.company_data['default_journal_cash'].id,
            'receivable_account_id': cls.pos_receivable_bank.id,
            'company_id': cls.company.id,
        })
        cls.qris_pm = cls.env['pos.payment.method'].sudo().create({
            'name': 'QRIS',
            'type': 'bank',
            'journal_id': cls.company_data['default_journal_bank'].id,
            'receivable_account_id': cls.pos_receivable_bank.id,
            'outstanding_account_id': cls.outstanding_bank.id,
            'company_id': cls.company.id,
            'payment_method_type': 'bank_qr_code',
            'qr_code_method': 'id_qr'
        })

        cls.main_pos_config = cls.env['pos.config'].sudo().create({
            'name': 'Shop',
            'module_pos_restaurant': False,
            # Make sure there is one extra payment method for the tour tests to work.
            # Because if the tour only use the qr payment method, the total amount won't be displayed,
            # causing the tour test to fail.
            'payment_method_ids': [(4, cls.bank_pm.id), (4, cls.qris_pm.id)],
        })

    def test_qris_transaction_allow_pos_order(self):
        """ pos.order model should be created """
        self.env['l10n_id.qris.transaction'].create({
            'model': 'pos.order',
            'model_id': '1234512345'
        })
        self.env['l10n_id.qris.transaction'].create({
            'model': 'account.move',
            'model_id': '1'
        })

        with self.assertRaises(ValidationError):
            self.env['l10n_id.qris.transaction'].create({
                'model': 'new.model',
                'model_id': '1',
            })

    def test_qris_link_with_pos_order(self):
        """ Test whether it's possible to link QRIS transaction with a pos.order record through
        UUID field instead of id """
        self.main_pos_config.with_user(self.qris_pos_user).open_ui()
        pos_order = self.env['pos.order'].with_user(self.qris_pos_user).create({
            'company_id': self.env.company.id,
            'session_id': self.main_pos_config.current_session_id.id,
            'partner_id': self.partner_a.id,
            'access_token': '1234567890',
            'uuid': '1234512345',
            'lines': [(0, 0, {
                'name': "OL/0001",
                'product_id': self.product_1.id,
                'price_unit': 10000,
                'discount': 0.0,
                'qty': 1.0,
                'tax_ids': False,
                'price_subtotal': 10,
                'price_subtotal_incl': 10,
            })],
            'amount_tax': 0,
            'amount_total': 10,
            'amount_paid': 10.0,
            'amount_return': 10.0,
        })
        qris_transaction = self.env['l10n_id.qris.transaction'].create({
            'model': 'pos.order',
            'model_id': '1234512345',
        })

        record = qris_transaction._get_record()
        self.assertEqual(pos_order, record)

    def test_qris_qr_code_value(self):
        """ The QR-code image is drawn by the PoS client, so the server has to return the
        raw QRIS payload the bank app expects, and not the URL of the report rendering it.
        """
        qris_content = "00020101021226610014COM.QRIS.WWW011893600914123456789002150000000000000000303UMI51440014ID.CO.QRIS.WWW0215ID10200211817450303UMI5204541153033605802ID5910Odoo Store6007JAKARTA6304A1B2"

        def _patched_make_qris_request(endpoint, params):
            return {
                "status": "success",
                "data": {
                    "qris_content": qris_content,
                    "qris_request_date": "2024-02-27 11:13:42",
                    "qris_invoiceid": "413255111",
                    "qris_nmid": "ID1020021181745",
                },
            }

        with patch('odoo.addons.l10n_id.models.res_bank._l10n_id_make_qris_request', side_effect=_patched_make_qris_request):
            qr_value = self.qris_pm.get_qr_code_value(1000, 'Order 00042', '', self.company.currency_id.id, False)

        self.assertEqual(qr_value, qris_content)

    def test_tour_qris_payment_fail(self):
        """ Add products, show QR code and confirm. When confirming, the result will be status
        unpaid and so it should trigger a warning dialog informing it"""

        def _patched_make_qris_request(endpoint, params):
            if endpoint == 'show_qris.php':
                self.assertTrue(params['cliTrxNumber'])
                return {
                    "status": "success",
                    "data": {
                        "qris_content": "Test Content",
                        "qris_request_date": "2024-02-27 11:13:42",
                        "qris_invoiceid": "413255111",
                        "qris_nmid": "ID1020021181745"
                    }
                }
            elif endpoint == 'checkpaid_qris.php':
                return {
                    "status": "failed",
                    "data": {
                        "qris_status": "unpaid"
                    }
                }

        self.main_pos_config.with_user(self.qris_pos_user).open_ui()
        with patch('odoo.addons.l10n_id.models.res_bank._l10n_id_make_qris_request', side_effect=_patched_make_qris_request):
            self.start_tour("/pos/ui/%d" % self.main_pos_config.id, 'PaymentScreenQRISPaymentFail', login="qris_pos_user")

    def test_tour_qris_payment_success(self):
        """ Successful fetching status should proceed next to go to receipt screen"""
        def _patched_make_qris_request(endpoint, params):
            if endpoint == 'show_qris.php':
                return {
                    "status": "success",
                    "data": {
                        "qris_content": "Test Content",
                        "qris_request_date": "2024-02-27 11:13:42",
                        "qris_invoiceid": "413255111",
                        "qris_nmid": "ID1020021181745"
                    }
                }
            elif endpoint == 'checkpaid_qris.php':
                return {
                    "status": "success",
                    "data": {
                        "qris_status": "paid",
                        "qris_payment_customername": "Zainal Arief",
                        "qris_payment_methodby": "Sakuku"
                    },
                    "qris_api_version_code": "2206091709"
                }
        self.main_pos_config.with_user(self.qris_pos_user).open_ui()
        with patch('odoo.addons.l10n_id.models.res_bank._l10n_id_make_qris_request', side_effect=_patched_make_qris_request):
            self.start_tour("/pos/ui/%d" % self.main_pos_config.id, 'PaymentScreenQRISPaymentSuccess', login="qris_pos_user")

    @freeze_time("2024-02-27 04:15:00")
    def test_only_call_api_call_once(self):
        """ Simulate generating QR, cancel the popup, when we click show QR again, it shouldn't trigger
        to fetch new QR code from QRIS"""
        def _patched_make_qris_request(endpoint, params):
            if endpoint == 'show_qris.php':
                return {
                    "status": "success",
                    "data": {
                        "qris_content": "Test Content",
                        "qris_request_date": "2024-02-27 11:13:42",
                        "qris_invoiceid": "413255111",
                        "qris_nmid": "ID1020021181745"
                    }
                }
            elif endpoint == 'checkpaid_qris.php':
                return {
                    "status": "success",
                    "data": {
                        "qris_status": "paid",
                        "qris_payment_customername": "Zainal Arief",
                        "qris_payment_methodby": "Sakuku"
                    },
                    "qris_api_version_code": "2206091709"
                }
        self.main_pos_config.with_user(self.qris_pos_user).open_ui()
        with patch('odoo.addons.l10n_id.models.res_bank._l10n_id_make_qris_request', side_effect=_patched_make_qris_request) as patched:
            self.start_tour("/pos/ui/%d" % self.main_pos_config.id, 'PayementScreenQRISFetchQR', login="qris_pos_user")
            self.assertEqual(patched.call_count, 1)

    @freeze_time("2024-02-27 04:15:00")
    def test_qris_change_amount(self):
        """ Test that when user changes the amount of order after generating QRIS QR for the first time,
        it should request for new QR code afterwards. Therefore, there should be 2 API calls instead"""
        def _patched_make_qris_request(endpoint, params):
            if endpoint == 'show_qris.php':
                return {
                    "status": "success",
                    "data": {
                        "qris_content": "Test Content",
                        "qris_request_date": "2024-02-27 11:13:42",
                        "qris_invoiceid": "413255111",
                        "qris_nmid": "ID1020021181745"
                    }
                }
        self.main_pos_config.with_user(self.qris_pos_user).open_ui()
        self.main_pos_config.current_session_id.set_opening_control(0, 'notes')
        with patch('odoo.addons.l10n_id.models.res_bank._l10n_id_make_qris_request', side_effect=_patched_make_qris_request) as patched:
            self.start_tour("/pos/ui/%d" % self.main_pos_config.id, 'PayementScreenQRISChangeAmount', login="qris_pos_user")
            self.assertEqual(patched.call_count, 3)

    def _create_pos_qris_transaction(self, order_uuid, amount, paid=False, qris_invoice_id='413255111'):
        return self.env['l10n_id.qris.transaction'].create({
            'model': 'pos.order',
            'model_id': order_uuid,
            'qris_invoice_id': qris_invoice_id,
            'qris_amount': amount,
            'qris_content': 'Test Content',
            'qris_creation_datetime': fields.Datetime.now(),
            'bank_id': self.acc_qris_id.id,
            'paid': paid,
        })

    def test_qris_webhook_notify_pos(self):
        """ Webhook payment of a pos.order should notify the open PoS using the QRIS bank account """
        self.main_pos_config.with_user(self.qris_pos_user).open_ui()
        # Config without open session
        self.env['pos.config'].create({
            'name': 'Closed Shop',
            'payment_method_ids': [(4, self.qris_pm.id)],
        })
        transaction = self._create_pos_qris_transaction('1234512345', 1000)

        with patch.object(self.registry['pos.config'], '_notify', autospec=True) as notify:
            self.acc_qris_id.sudo()._l10n_id_qris_process_webhook({'invoice': '413255111', 'qris_status': 'success'})

        self.assertTrue(transaction.paid)
        notify.assert_called_once_with(self.main_pos_config, 'L10N_ID_QRIS_PAID', {'uuid': '1234512345'})

    def test_qris_is_paid(self):
        """ Only the latest QR code of the order, paid for the same amount, is considered paid """
        transaction = self._create_pos_qris_transaction('1234512345', 1000, paid=True)
        self.assertTrue(self.qris_pm.l10n_id_qris_is_paid('1234512345', 1000))
        self.assertFalse(self.qris_pm.l10n_id_qris_is_paid('1234512345', 2000))
        self.assertFalse(self.qris_pm.l10n_id_qris_is_paid('5432154321', 1000))

        # A newer unpaid QR code
        new_transaction = self._create_pos_qris_transaction('1234512345', 1000, qris_invoice_id='413255112')
        new_transaction.qris_creation_datetime = transaction.qris_creation_datetime + timedelta(minutes=1)
        self.assertFalse(self.qris_pm.l10n_id_qris_is_paid('1234512345', 1000))

    def test_qris_verify_status_paid_transaction(self):
        """ A transaction already paid should not be checked with the QRIS API """
        self._create_pos_qris_transaction('1234512345', 1000, paid=True)
        with patch('odoo.addons.l10n_id.models.res_bank._l10n_id_make_qris_request') as patched:
            self.assertTrue(self.qris_pm.l10n_id_verify_qris_status('1234512345'))
            self.assertEqual(patched.call_count, 0)

    def _start_qris_webhook_tour(self, tour_name):
        """ Run a tour that pays the QR code through the webhook """
        def _patched_make_qris_request(endpoint, params):
            # Only QR code generation is expected, no status check
            self.assertEqual(endpoint, 'show_qris.php')
            return {
                "status": "success",
                "data": {
                    "qris_content": "Test Content",
                    "qris_request_date": "2024-02-27 11:13:42",
                    "qris_invoiceid": "413255111",
                    "qris_nmid": "ID1020021181745"
                }
            }

        def _patched_get_bank_from_token(bank, token):
            return bank.browse(self.acc_qris_id.id if token == 'test_token' else [])

        self.main_pos_config.with_user(self.qris_pos_user).open_ui()
        with (
            patch('odoo.addons.l10n_id.models.res_bank._l10n_id_make_qris_request', side_effect=_patched_make_qris_request),
            patch.object(self.registry['res.partner.bank'], '_l10n_id_get_bank_from_qris_webhook_token', _patched_get_bank_from_token),
        ):
            self.start_tour("/pos/ui/%d" % self.main_pos_config.id, tour_name, login="qris_pos_user")

    def test_tour_qris_webhook_payment(self):
        """ Webhook payment should close the QR popup and validate the order """
        self._start_qris_webhook_tour('PaymentScreenQRISWebhookPayment')

    def test_tour_qris_paid_after_discard(self):
        """ Retrying after the discarded QR code was paid should validate the order without a new QR code """
        self._start_qris_webhook_tour('PaymentScreenQRISPaidAfterDiscard')
