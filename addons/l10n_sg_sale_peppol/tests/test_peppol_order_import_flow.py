import json
import logging
from base64 import b64encode
from datetime import datetime
from lxml import etree

from requests import PreparedRequest, Response, Session

from odoo.tests import freeze_time
from odoo.tests.common import tagged
from odoo.tools.misc import file_open

from odoo.addons.account_peppol.tests.test_peppol_messages import TestPeppolMessage

_logger = logging.getLogger(__name__)

FILE_PATH = 'l10n_sg_sale_peppol/tests/assets'
FAKE_UUID = ['yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy',
             'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz']


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestPeppolOrderImportFlow(TestPeppolMessage):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.test_product_a = cls.env["product.product"].create(
            {
                "name": "Needle 4mm",
                "default_code": "121212",
                "type": "consu",
                "list_price": 50,
            },
        )

    @classmethod
    def _request_handler(cls, s: Session, r: PreparedRequest, /, **kw):
        response = Response()
        response.status_code = 200
        url = r.path_url.lower()

        if url == '/api/peppol/1/get_document':
            body = json.loads(r.body)
            uuid = body['params']['message_uuids'][0]
            if uuid == FAKE_UUID[0]:
                response_content = {
                    'accounting_supplier_party': False,
                    'filename': 'test_outgoing.xml',
                    'enc_key': '',
                    'document': '',
                    'state': 'done' if not cls.env.context.get('error') else 'error',
                    'direction': 'outgoing',
                    'document_type': 'Invoice',
                }
            elif uuid == FAKE_UUID[1]:
                response_content = {
                    'accounting_supplier_party': '0198:dk16356706',
                    'filename': 'test_incoming',
                    'enc_key': file_open(f'{FILE_PATH}/enc_key', mode='rb').read(),
                    'document': b64encode(file_open(f'{FILE_PATH}/{cls.mocked_incoming_invoice_fname}', mode='rb').read()),
                    'state': 'done' if not cls.env.context.get('error') else 'error',
                    'direction': 'incoming',
                    'document_type': 'Invoice',
                    'origin_message_uuid': 'not_used_on_advanced_order',
                }
            response.json = lambda: {'result': {uuid: response_content}}
            return response

        if url == '/api/peppol/1/get_all_documents':
            response.json = lambda: {'result': {'messages': [{
                'uuid': FAKE_UUID[1],
                'state': 'done',
                'direction': 'incoming',
                'document_type': 'Invoice',
                'sender': '0198:dk16356706',
                'receiver': '0088:test',
                'timestamp': '2024-01-01',
                'error': False,
            }]}}
            return response

        if url == '/api/peppol/1/send_document':
            body = json.loads(r.body)
            num_docs = len(body['params']['documents'])
            response.json = lambda: {'result': {'messages': [{'message_uuid': '11111111-1111-4111-8111-111111111111'}] * num_docs}}
            return response

        if url == '/api/peppol/1/ack':
            response.json = lambda: {'result': {}}
            return response

        return super()._request_handler(s, r, **kw)

    def _get_review_activities(self, order):
        return order.activity_ids.filtered(
            lambda a: a.activity_type_id == self.env.ref('l10n_sg_sale_peppol.mail_activity_type_peppol_order_review'),
        )

    def test_end_to_end_basic_order_processing(self):
        """Test complete workflow from XML document to sale order creation - basic order"""
        cls = self.__class__
        cls.mocked_incoming_invoice_fname = 'order_encrypted'

        def restore_mocked_incoming_invoice_fname():
            cls.mocked_incoming_invoice_fname = 'incoming_invoice'
        self.addCleanup(restore_mocked_incoming_invoice_fname)

        with freeze_time('2024-01-15 03:00:00'):
            self.env['account_edi_proxy_client.user'].sudo()._cron_peppol_get_new_documents()

        order = self.env['sale.order'].sudo().search([('l10n_sg_peppol_message_uuid', '=', FAKE_UUID[1])])
        # The quotation date is the import date, not a date from the document.
        self.assertEqual(order.date_order, datetime(2024, 1, 15, 3, 0, 0))
        order_tx = order.l10n_sg_peppol_order_tx_ids[0]
        self.assertRecordValues(
            order_tx,
            [{
                'document_type': 'order',
                'state': 'to_reply',
            }],
        )
        self.assertEqual(self._get_review_activities(order), order_tx.activity_id)
        with freeze_time('2024-01-20 05:00:00'):
            order.action_confirm()
        # Once confirmed, the quotation date is the confirmation date.
        self.assertEqual(order.date_order, datetime(2024, 1, 20, 5, 0, 0))
        self.assertRecordValues(order_tx, [{
            'state': 'accepted',
        }])
        self.assertFalse(self._get_review_activities(order))

    def test_order_change_processing(self):
        """ Test complete workflow from XML document to sale order creation and follow up receipt
            of order change request.
        """
        cls = self.__class__

        def restore_mocked_incoming_invoice_fname():
            cls.mocked_incoming_invoice_fname = 'incoming_invoice'
        self.addCleanup(restore_mocked_incoming_invoice_fname)

        cls.mocked_incoming_invoice_fname = 'order_encrypted'
        self.env['account_edi_proxy_client.user'].sudo()._cron_peppol_get_new_documents()

        # Test order amount total
        order = self.env['sale.order'].sudo().search([('l10n_sg_peppol_message_uuid', '=', FAKE_UUID[1])])
        self.assertEqual(order.amount_total, 840.0)

        cls.mocked_incoming_invoice_fname = 'order_change_encrypted'
        self.env['account_edi_proxy_client.user'].sudo()._cron_peppol_get_new_documents()

        # Test log notes
        messages = order.message_ids.filtered(lambda m: 'Line changed: Item 1' in m.body)
        self.assertTrue(messages)

        order_change_tx = order.l10n_sg_peppol_order_tx_ids.filtered_domain([
            ('document_type', '=', 'order_change'),
        ])
        self.assertTrue(order_change_tx.activity_id)
        order.action_apply_peppol_order_change()
        self.assertEqual(order.amount_total, 600.0)
        self.assertEqual(order_change_tx.state, 'accepted')
        self.assertTrue(order_change_tx.activity_id.date_done)

    def test_order_cancel_processing(self):
        """ Test complete workflow from XML document to sale order creation and follow up receipt
            of order cancellation request.
        """
        cls = self.__class__

        def restore_mocked_incoming_invoice_fname():
            cls.mocked_incoming_invoice_fname = 'incoming_invoice'
        self.addCleanup(restore_mocked_incoming_invoice_fname)

        cls.mocked_incoming_invoice_fname = 'order_encrypted'
        self.env['account_edi_proxy_client.user'].sudo()._cron_peppol_get_new_documents()

        cls.mocked_incoming_invoice_fname = 'order_cancel_encrypted'
        self.env['account_edi_proxy_client.user'].sudo()._cron_peppol_get_new_documents()

        order = self.env['sale.order'].sudo().search([('l10n_sg_peppol_message_uuid', '=', FAKE_UUID[1])])
        order_tx = order.l10n_sg_peppol_order_tx_ids.filtered_domain([('document_type', '=', 'order')])
        order.action_apply_peppol_order_cancel()
        self.assertEqual(order.state, 'cancel')
        # The pending order itself is not rejected: the cancellation reply answers the buyer.
        self.assertEqual(order_tx.state, 'to_reply')
        self.assertFalse(self._get_review_activities(order))

    def test_order_rejection_processing(self):
        """Test complete workflow from XML document to sale order creation - order rejection"""
        cls = self.__class__
        cls.mocked_incoming_invoice_fname = 'order_encrypted'

        def restore_mocked_incoming_invoice_fname():
            cls.mocked_incoming_invoice_fname = 'incoming_invoice'
        self.addCleanup(restore_mocked_incoming_invoice_fname)

        self.env['account_edi_proxy_client.user'].sudo()._cron_peppol_get_new_documents()

        order = self.env['sale.order'].sudo().search([('l10n_sg_peppol_message_uuid', '=', FAKE_UUID[1])])
        order_tx = order.l10n_sg_peppol_order_tx_ids[0]
        self.assertRecordValues(
            order_tx,
            [{
                'document_type': 'order',
                'state': 'to_reply',
            }],
        )
        self.assertEqual(self._get_review_activities(order), order_tx.activity_id)
        order.action_cancel()
        self.assertRecordValues(order_tx, [{
            'state': 'rejected',
        }])
        self.assertFalse(self._get_review_activities(order))

    def test_order_change_rejection_processing(self):
        """ Test complete workflow from XML document to sale order creation and follow up receipt
            of order change request rejection.
        """
        cls = self.__class__

        def restore_mocked_incoming_invoice_fname():
            cls.mocked_incoming_invoice_fname = 'incoming_invoice'
        self.addCleanup(restore_mocked_incoming_invoice_fname)

        cls.mocked_incoming_invoice_fname = 'order_encrypted'
        self.env['account_edi_proxy_client.user'].sudo()._cron_peppol_get_new_documents()

        # Test order amount total
        order = self.env['sale.order'].sudo().search([('l10n_sg_peppol_message_uuid', '=', FAKE_UUID[1])])
        original_amount = order.amount_total
        self.assertEqual(original_amount, 840.0)

        cls.mocked_incoming_invoice_fname = 'order_change_encrypted'
        self.env['account_edi_proxy_client.user'].sudo()._cron_peppol_get_new_documents()

        # Test log notes
        messages = order.message_ids.filtered(lambda m: 'Line changed: Item 1' in m.body)
        self.assertTrue(messages)

        order_change_tx = order.l10n_sg_peppol_order_tx_ids.filtered_domain([
            ('document_type', '=', 'order_change'),
        ])[0]
        order.action_reject_peppol_order_change()
        self.assertRecordValues(order_change_tx, [{
            'state': 'rejected',
        }])
        # Verify order amount remains unchanged after rejection
        self.assertEqual(order.amount_total, original_amount)

    def test_line_delivery_period_import(self):
        """Test that RequestedDeliveryPeriod is parsed from a LineItem node into the requested
        delivery datetimes of the order line, stored in UTC."""
        parser = self.env['sale.edi.xml.ubl_bis3_advanced_order']
        order = self.env['sale.order'].new({'company_id': self.env.company.id})
        self.env.company.partner_id.tz = 'Asia/Singapore'

        def get_delivery_vals(line_tree):
            line_vals = parser._retrieve_line_vals(order, line_tree)
            return {key: line_vals[key] for key in ('l10n_sg_delivery_start', 'l10n_sg_delivery_end') if key in line_vals}

        def make_period_xml(start_date='', start_time='', end_date='', end_time=''):
            children = ''
            if start_date:
                children += f'<cbc:StartDate>{start_date}</cbc:StartDate>'
            if start_time:
                children += f'<cbc:StartTime>{start_time}</cbc:StartTime>'
            if end_date:
                children += f'<cbc:EndDate>{end_date}</cbc:EndDate>'
            if end_time:
                children += f'<cbc:EndTime>{end_time}</cbc:EndTime>'
            return etree.fromstring(
                f'<LineItem'
                f' xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"'
                f' xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">'
                f'<cbc:ID>1</cbc:ID><cbc:Quantity>1</cbc:Quantity><cac:Item><cbc:Name>Item</cbc:Name></cac:Item>'
                f'<cac:Delivery><cac:RequestedDeliveryPeriod>{children}</cac:RequestedDeliveryPeriod></cac:Delivery>'
                f'</LineItem>'
            )

        # Times without offset are in the company timezone (UTC+8).
        vals = get_delivery_vals(make_period_xml('2024-01-01', '09:00:00', '2024-01-31', '17:00:00'))
        self.assertEqual(vals, {
            'l10n_sg_delivery_start': datetime(2024, 1, 1, 1, 0, 0),
            'l10n_sg_delivery_end': datetime(2024, 1, 31, 9, 0, 0),
        })

        # Times with an offset are converted from it.
        vals = get_delivery_vals(make_period_xml(start_date='2024-01-01', start_time='09:00:00Z'))
        self.assertEqual(vals, {'l10n_sg_delivery_start': datetime(2024, 1, 1, 9, 0, 0), 'l10n_sg_delivery_end': False})

        # Dates without time cover the whole day.
        vals = get_delivery_vals(make_period_xml(start_date='2024-01-01', end_date='2024-01-31'))
        self.assertEqual(vals, {
            'l10n_sg_delivery_start': datetime(2023, 12, 31, 16, 0, 0),
            'l10n_sg_delivery_end': datetime(2024, 1, 31, 15, 59, 59),
        })

        # No delivery element at all
        self.assertEqual(get_delivery_vals(etree.fromstring(
            '<LineItem xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">'
            '<cbc:ID>1</cbc:ID><cbc:Quantity>1</cbc:Quantity></LineItem>'
        )), {})

    @freeze_time('2024-01-05 03:00:00')
    def test_order_validity_period_import(self):
        """Test the buyer's deadline (ValidityPeriod) becomes the due date of the review activity,
        and that neither it nor a line delivery date is used as a quotation date or expiration."""
        env = self.env(su=True)
        order = env['sale.order'].create({'partner_id': env['res.partner'].create({'name': 'Buyer'}).id})
        default_validity_date = order.validity_date

        def make_order_xml(validity_end_date=None):
            validity_xml = (
                f'<cac:ValidityPeriod><cbc:EndDate>{validity_end_date}</cbc:EndDate></cac:ValidityPeriod>'
                if validity_end_date else ''
            )
            return (
                f'<Order xmlns="urn:oasis:names:specification:ubl:schema:xsd:Order-2"'
                f' xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"'
                f' xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">'
                f'<cbc:ID>ORDER-1</cbc:ID><cbc:IssueDate>2024-01-05</cbc:IssueDate>{validity_xml}'
                f'<cac:OrderLine><cac:LineItem><cac:Delivery><cac:RequestedDeliveryPeriod>'
                f'<cbc:EndDate>2024-02-01</cbc:EndDate>'
                f'</cac:RequestedDeliveryPeriod></cac:Delivery></cac:LineItem></cac:OrderLine>'
                f'</Order>'
            )

        order_vals, _logs = env['sale.edi.xml.ubl_bis3_advanced_order']._retrieve_order_vals(
            order, etree.fromstring(make_order_xml('2024-01-11')),
        )
        self.assertNotIn('date_order', order_vals)
        self.assertNotIn('validity_date', order_vals)

        def schedule_review(validity_end_date=None):
            order_tx = env['sale.peppol.advanced.order.transaction'].create({
                'order_id': order.id,
                'attachment_id': env['ir.attachment'].create({
                    'name': 'order.xml',
                    'raw': make_order_xml(validity_end_date).encode(),
                    'mimetype': 'application/xml',
                }).id,
                'state': 'to_reply',
                'document_type': 'order',
            })
            order._l10n_sg_peppol_schedule_review(order_tx, "Review the order.")
            return order_tx.activity_id

        activity = schedule_review('2024-01-11')
        self.assertEqual(str(activity.date_deadline), '2024-01-11')
        self.assertIn('The buyer expects a response by', str(activity.note))
        self.assertEqual(order.validity_date, default_validity_date)

        # Without a deadline from the buyer, the activity type's default due date applies.
        activity = schedule_review()
        self.assertEqual(str(activity.date_deadline), '2024-01-05')
        self.assertNotIn('The buyer expects a response by', str(activity.note))

    def test_order_cancel_rejection_processing(self):
        """ Test complete workflow from XML document to sale order creation and follow up receipt
            of order cancellation request rejection.
        """
        cls = self.__class__

        def restore_mocked_incoming_invoice_fname():
            cls.mocked_incoming_invoice_fname = 'incoming_invoice'
        self.addCleanup(restore_mocked_incoming_invoice_fname)

        cls.mocked_incoming_invoice_fname = 'order_encrypted'
        self.env['account_edi_proxy_client.user'].sudo()._cron_peppol_get_new_documents()

        cls.mocked_incoming_invoice_fname = 'order_cancel_encrypted'
        self.env['account_edi_proxy_client.user'].sudo()._cron_peppol_get_new_documents()

        order = self.env['sale.order'].sudo().search([('l10n_sg_peppol_message_uuid', '=', FAKE_UUID[1])])
        order_cancel_tx = order.l10n_sg_peppol_order_tx_ids.filtered_domain([
            ('document_type', '=', 'order_cancel'),
        ])[0]
        # Verify order is not cancelled before rejection
        self.assertNotEqual(order.state, 'cancel')
        order.action_reject_peppol_order_cancel()
        self.assertRecordValues(order_cancel_tx, [{
            'state': 'rejected',
        }])
        # Verify order remains active (not cancelled) after rejecting the cancellation
        self.assertNotEqual(order.state, 'cancel')

    def test_order_delivery_partner_import(self):
        """Test the delivery information of an order is resolved to the buyer, one of its contacts
        or a known GLN partner, and becomes a new delivery address of the buyer otherwise."""
        env = self.env(su=True)
        parser = env['sale.edi.xml.ubl_bis3_advanced_order']
        singapore = env.ref('base.sg')
        buyer = env['res.partner'].create({
            'name': 'Buyer',
            'is_company': True,
            'street': '1 Buyer Road',
            'zip': '111111',
            'country_id': singapore.id,
        })
        warehouse = env['res.partner'].create({
            'name': 'Buyer Warehouse',
            'type': 'delivery',
            'parent_id': buyer.id,
            'street': '2 Warehouse Road',
            'zip': '222222',
            'country_id': singapore.id,
        })
        end_customer = env['res.partner'].create({'name': 'End Customer', 'global_location_number': '5880000000010'})
        order = env['sale.order'].create({'partner_id': buyer.id})

        def import_delivery_partner(delivery_xml):
            return parser._import_order_delivery_partner(order, etree.fromstring(
                f'<Order xmlns="urn:oasis:names:specification:ubl:schema:xsd:Order-2"'
                f' xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"'
                f' xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">'
                f'<cbc:ID>ORDER-1</cbc:ID>{delivery_xml}</Order>'
            ))[0]

        def make_address_xml(street, zip_code, tag='Address'):
            return (
                f'<cac:{tag}><cbc:StreetName>{street}</cbc:StreetName><cbc:PostalZone>{zip_code}</cbc:PostalZone>'
                f'<cac:Country><cbc:IdentificationCode>SG</cbc:IdentificationCode></cac:Country></cac:{tag}>'
            )

        def make_party_xml(name, inner=''):
            return f'<cac:DeliveryParty>{inner}<cac:PartyName><cbc:Name>{name}</cbc:Name></cac:PartyName></cac:DeliveryParty>'

        # Without delivery information, the order is delivered to the buyer.
        self.assertEqual(import_delivery_partner(''), buyer)
        self.assertEqual(import_delivery_partner(
            '<cac:Delivery><cac:RequestedDeliveryPeriod><cbc:EndDate>2024-02-01</cbc:EndDate>'
            '</cac:RequestedDeliveryPeriod></cac:Delivery>'
        ), buyer)

        # Delivery information repeating the buyer's address resolves to the buyer.
        self.assertEqual(import_delivery_partner(
            f'<cac:Delivery><cac:DeliveryLocation>{make_address_xml(" 1  buyer road", "111111")}</cac:DeliveryLocation>'
            f'{make_party_xml("Buyer")}</cac:Delivery>'
        ), buyer)

        # An address of a known contact resolves to it, from the location or the party address.
        self.assertEqual(import_delivery_partner(
            f'<cac:Delivery><cac:DeliveryLocation>{make_address_xml("2 Warehouse Road", "222222")}</cac:DeliveryLocation></cac:Delivery>'
        ), warehouse)
        self.assertEqual(import_delivery_partner(
            f'<cac:Delivery>{make_party_xml("Buyer Warehouse", make_address_xml("2 Warehouse Road", "222222", "PostalAddress"))}</cac:Delivery>'
        ), warehouse)

        # A contact name alone resolves to that contact.
        self.assertEqual(import_delivery_partner(f'<cac:Delivery>{make_party_xml("Buyer Warehouse")}</cac:Delivery>'), warehouse)

        # A known GLN resolves to its partner, even outside the buyer's contacts.
        self.assertEqual(import_delivery_partner(
            '<cac:Delivery><cac:DeliveryLocation><cbc:ID schemeID="0088">5880000000010</cbc:ID>'
            f'{make_address_xml("3 Elsewhere Road", "333333")}</cac:DeliveryLocation></cac:Delivery>'
        ), end_customer)

        # An unknown delivery location becomes a new delivery address of the buyer.
        new_address = import_delivery_partner(
            '<cac:Delivery><cac:DeliveryLocation><cbc:ID schemeID="0088">5880000000027</cbc:ID>'
            f'{make_address_xml("4 New Road", "444444")}</cac:DeliveryLocation>'
            f'{make_party_xml("Site Office", "")}</cac:Delivery>'
        )
        self.assertRecordValues(new_address, [{
            'name': 'Site Office',
            'type': 'delivery',
            'parent_id': buyer.id,
            'street': '4 New Road',
            'zip': '444444',
            'country_id': singapore.id,
            'global_location_number': '5880000000027',
        }])

        # An invalid GLN is ignored.
        new_address = import_delivery_partner(
            '<cac:Delivery><cac:DeliveryLocation><cbc:ID schemeID="0088">1234</cbc:ID>'
            f'{make_address_xml("5 New Road", "555555")}</cac:DeliveryLocation></cac:Delivery>'
        )
        self.assertRecordValues(new_address, [{
            'type': 'delivery',
            'parent_id': buyer.id,
            'street': '5 New Road',
            'global_location_number': False,
        }])
