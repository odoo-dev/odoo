# Part of Odoo. See LICENSE file for full copyright and licensing details.
from contextlib import contextmanager
from unittest.mock import patch

from freezegun import freeze_time
from lxml import etree

from odoo import fields
from odoo.exceptions import UserError, ValidationError
from odoo.tests import tagged
from odoo.tools import mute_logger

from odoo.addons.account_reports.tests.common import TestAccountReportsCommon
from odoo.addons.l10n_my_edi.tests.test_file_generation import NS_MAP
from odoo.addons.point_of_sale.tests.common import TestPoSCommon

CONTACT_PROXY_METHOD = 'odoo.addons.l10n_my_edi.models.account_edi_proxy_user.AccountEdiProxyClientUser._l10n_my_edi_contact_proxy'


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestMyInvoisPoS(TestPoSCommon):

    @classmethod
    @TestAccountReportsCommon.setup_country('my')
    def setUpClass(cls):
        super().setUpClass()
        cls.config = cls.basic_config

        # Second config
        cash_journal = cls.env['account.journal'].create({
            'name': 'Other Cash Journal',
            'code': 'OCJ',
            'type': 'cash',
        })
        cash_payment = cls.env['pos.payment.method'].create({
            'name': 'Cash Payment',
            'journal_id': cash_journal.id,
            'receivable_account_id': cls.pos_receivable_cash.id,
            'company_id': cls.env.company.id,
        })
        cls.other_config = cls.config.copy()
        cls.other_config.payment_method_ids |= cash_payment

        cls.product_one = cls.create_product("Product 1", cls.categ_basic, 100, tax_ids=cls.taxes['tax7'].ids)
        cls.product_two = cls.create_product("Product 2", cls.categ_basic, 500, tax_ids=cls.taxes['tax7'].ids)
        (cls.product_one | cls.product_two).l10n_my_edi_classification_code = "022"

        cls.env.company.write({
            'vat': 'C2584563200',
            'l10n_my_edi_mode': 'test',
            'l10n_my_edi_industrial_classification': cls.env['l10n_my_edi.industry_classification'].search([('code', '=', '01111')]).id,
            'l10n_my_identification_type': 'BRN',
            'l10n_my_identification_number': '202001234567',
            'state_id': cls.env.ref('base.state_my_jhr').id,
            'street': 'that one street, 5',
            'city': 'Main city',
            'phone': '+60123456789',
        })
        cls.invoicing_customer = cls.customer
        cls.invoicing_customer.write({
            'vat': 'C2584563201',
            'l10n_my_identification_type': 'BRN',
            'l10n_my_identification_number': '202001234568',
            'country_id': cls.env.ref('base.my').id,
            'state_id': cls.env.ref('base.state_my_jhr').id,
            'street': 'that other street, 3',
            'city': 'Main city',
            'phone': '+60123456786',
        })

        cls.proxy_user = cls.env['account_edi_proxy_client.user']._register_proxy_user(cls.env.company, 'l10n_my_edi', 'demo')
        cls.proxy_user.edi_mode = 'test'

    ##################################
    # Base tests: consolidated invoice
    ##################################

    @mute_logger('odoo.addons.point_of_sale.models.pos_order')
    def test_01_consolidate_invoices(self):
        """ Creates and consolidate a few pos Order, then generate the consolidated invoice xml file. """
        with freeze_time("2025-01-01"):
            # Create the orders
            with self.with_pos_session():
                first_order = self._create_order({'pos_order_lines_ui_args': [(self.product_one, 1.0)]})
                second_order = self._create_order({'pos_order_lines_ui_args': [(self.product_two, 1.0)]})
            # Consolidate them
            wizard = self.env['myinvois.consolidate.invoice.wizard'].create({
                'date_from': '2025-01-01',
                'date_to': '2025-01-31',
            })
            wizard.button_consolidate_orders()
            # Assert the amount of consolidated invoices
            consolidated_invoice = (first_order | second_order).consolidated_invoice_ids
            self.assertEqual(len(consolidated_invoice), 1)  # One consolidated invoice holds up to 100 lines
            # Get the XML File, and assert the amount of lines
            consolidated_invoice.action_generate_xml_file()
            xml_tree = etree.fromstring(consolidated_invoice.myinvois_file_id.raw)
            self.assertEqual(len(xml_tree.xpath("cac:InvoiceLine", namespaces=NS_MAP)), 1)  # Both orders are continuous, so they are merged in a single line.
            # Finally, assert a few nodes to make sure the file make sense (line amount, customer tin (general one), ...
            self._assert_node_values(xml_tree, "cac:InvoiceLine/cbc:LineExtensionAmount", '600.00')
            self._assert_node_values(xml_tree, "cac:AccountingCustomerParty//cac:PartyIdentification/cbc:ID", 'EI00000000010')

    @mute_logger('odoo.addons.point_of_sale.models.pos_order')
    def test_02_consolidate_invoices_with_split(self):
        """ Make sure that when orders are not continuous, we split them in multiple lines. """
        with freeze_time("2025-01-01"):
            # Create the orders
            with self.with_pos_session(), patch(CONTACT_PROXY_METHOD, new=self._mock_successful_submission):
                first_order = self._create_order({'pos_order_lines_ui_args': [(self.product_one, 1.0)]})
                self._create_order({'pos_order_lines_ui_args': [(self.product_two, 1.0)], 'customer': self.invoicing_customer, 'is_invoiced': True})
                third_order = self._create_order({'pos_order_lines_ui_args': [(self.product_two, 1.0)]})
            # Consolidate them
            wizard = self.env['myinvois.consolidate.invoice.wizard'].create({
                'date_from': '2025-01-01',
                'date_to': '2025-01-31',
            })
            wizard.button_consolidate_orders()
            consolidated_invoice = (first_order | third_order).consolidated_invoice_ids
            # Get the XML File, and assert the amount of lines
            consolidated_invoice.action_generate_xml_file()
            xml_tree = etree.fromstring(consolidated_invoice.myinvois_file_id.raw)
            # There is an invoiced order between both consolidated orders, so there is two lines
            self.assertEqual(len(xml_tree.xpath("cac:InvoiceLine", namespaces=NS_MAP)), 2)
            # Finally, ensure that the line values are correct.
            self._assert_node_values(xml_tree, "cac:InvoiceLine[1]/cbc:LineExtensionAmount", '100.00')
            self._assert_node_values(xml_tree, "cac:InvoiceLine[2]/cbc:LineExtensionAmount", '500.00')

    @mute_logger('odoo.addons.point_of_sale.models.pos_order')
    def test_03_consolidate_invoices_from_multiple_configs(self):
        """ When consolidating from multiple configs at once, we expect one Consolidated Invoice per config. """
        with freeze_time("2025-01-01"):
            with self.with_pos_session():
                first_order = self._create_order({'pos_order_lines_ui_args': [(self.product_one, 1.0)]})
            self.config = self.other_config  # Switch config
            with self.with_pos_session():
                second_order = self._create_order({'pos_order_lines_ui_args': [(self.product_two, 1.0)]})
            # Consolidate them
            wizard = self.env['myinvois.consolidate.invoice.wizard'].create({
                'date_from': '2025-01-01',
                'date_to': '2025-01-31',
            })
            wizard.button_consolidate_orders()
            consolidated_invoice = (first_order | second_order).consolidated_invoice_ids
            self.assertEqual(len(consolidated_invoice), 2)  # One consolidated invoice holds up to 100 lines

    @mute_logger('odoo.addons.point_of_sale.models.pos_order')
    def test_04_consolidate_invoices_limit(self):
        """ Consolidate multiple orders by lowering the allowed amount of lines """
        with freeze_time("2025-01-01"):
            # Create two orders split in the middle to create two lines.
            with self.with_pos_session(), patch(CONTACT_PROXY_METHOD, new=self._mock_successful_submission):
                first_order = self._create_order({'pos_order_lines_ui_args': [(self.product_one, 1.0)]})
                self._create_order({'pos_order_lines_ui_args': [(self.product_two, 1.0)], 'customer': self.invoicing_customer, 'is_invoiced': True})
                third_order = self._create_order({'pos_order_lines_ui_args': [(self.product_two, 1.0)]})

            with patch('odoo.addons.l10n_my_edi_pos.wizard.myinvois_consolidate_invoice_wizard.MAX_LINE_COUNT_PER_INVOICE', 1):
                # Consolidate them
                wizard = self.env['myinvois.consolidate.invoice.wizard'].create({
                    'date_from': '2025-01-01',
                    'date_to': '2025-01-31',
                })
                wizard.button_consolidate_orders()
                consolidated_invoice = (first_order | third_order).consolidated_invoice_ids
                self.assertEqual(len(consolidated_invoice), 2)  # Two consolidated invoices of a single line due to the MAX_LINE_COUNT_PER_INVOICE

    @mute_logger('odoo.addons.point_of_sale.models.pos_order')
    def test_05_send_consolidated_invoice(self):
        with freeze_time("2025-01-01"):
            # Create the orders
            with self.with_pos_session():
                first_order = self._create_order({'pos_order_lines_ui_args': [(self.product_one, 1.0)]})
                second_order = self._create_order({'pos_order_lines_ui_args': [(self.product_two, 1.0)]})
            # Consolidate them
            wizard = self.env['myinvois.consolidate.invoice.wizard'].create({
                'date_from': '2025-01-01',
                'date_to': '2025-01-31',
            })
            wizard.button_consolidate_orders()
            consolidated_invoice = (first_order | second_order).consolidated_invoice_ids
            with patch(CONTACT_PROXY_METHOD, new=self._mock_successful_submission):
                consolidated_invoice.action_submit_to_myinvois()
                self.assertRecordValues(consolidated_invoice, [{
                    'myinvois_submission_uid': '123456789',
                    'myinvois_external_uuid': '123458974513518',
                    'myinvois_validation_time': fields.Datetime.from_string('2025-01-01 01:00:00'),
                }])

    @mute_logger('odoo.addons.point_of_sale.models.pos_order')
    def test_06_send_multiple_consolidated_invoice(self):
        with freeze_time("2025-01-01"):
            with self.with_pos_session():
                first_order = self._create_order({'pos_order_lines_ui_args': [(self.product_one, 1.0)]})
            self.config = self.other_config  # Switch config
            with self.with_pos_session():
                second_order = self._create_order({'pos_order_lines_ui_args': [(self.product_two, 1.0)]})
            # Consolidate them
            wizard = self.env['myinvois.consolidate.invoice.wizard'].create({
                'date_from': '2025-01-01',
                'date_to': '2025-01-31',
            })
            wizard.button_consolidate_orders()
            consolidated_invoice = (first_order | second_order).consolidated_invoice_ids
            with patch(CONTACT_PROXY_METHOD, new=self._mock_successful_submission):
                consolidated_invoice.action_submit_to_myinvois()
                self.assertRecordValues(consolidated_invoice, [{
                    'myinvois_submission_uid': '123456789',
                    'myinvois_external_uuid': '123458974513518',
                    'myinvois_validation_time': fields.Datetime.from_string('2025-01-01 01:00:00'),
                }, {
                    'myinvois_submission_uid': '123456789',
                    'myinvois_external_uuid': '123458974513519',
                    'myinvois_validation_time': fields.Datetime.from_string('2025-01-01 01:00:00'),
                }])

    @mute_logger('odoo.addons.point_of_sale.models.pos_order')
    def test_07_invoice_from_pos(self):
        with freeze_time("2025-01-01"):
            with self.with_pos_session(), patch(CONTACT_PROXY_METHOD, new=self._mock_successful_submission):
                order = self._create_order({'pos_order_lines_ui_args': [(self.product_two, 1.0)], 'customer': self.invoicing_customer, 'is_invoiced': True})
            self.assertRecordValues(order.account_move.l10n_my_edi_document_ids._get_active_document(), [{
                'myinvois_submission_uid': '123456789',
                'myinvois_external_uuid': '123458974513518',
                'myinvois_validation_time': fields.Datetime.from_string('2025-01-01 01:00:00'),
                'myinvois_document_long_id': '123-789-654',
            }])

    @mute_logger('odoo.addons.point_of_sale.models.pos_order')
    def test_08_delete_consolidated_invoice(self):
        with freeze_time("2025-01-01"):
            with self.with_pos_session():
                first_order = self._create_order({'pos_order_lines_ui_args': [(self.product_one, 1.0)]})
                second_order = self._create_order({'pos_order_lines_ui_args': [(self.product_two, 1.0)]})
            wizard = self.env['myinvois.consolidate.invoice.wizard'].create({
                'date_from': '2025-01-01',
                'date_to': '2025-01-31',
            })
            wizard.button_consolidate_orders()
            consolidated_invoice = (first_order | second_order).consolidated_invoice_ids
            # We can delete consolidated orders that are in Draft (unsent)
            consolidated_invoice.unlink()
            self.assertFalse(consolidated_invoice.exists())
            # Redo another consolidated invoice, but send it.
            wizard.button_consolidate_orders()
            consolidated_invoice = (first_order | second_order).consolidated_invoice_ids
            with patch(CONTACT_PROXY_METHOD, new=self._mock_successful_submission):
                consolidated_invoice.action_submit_to_myinvois()
            # We cannot delete a sent invoice (validation in progress, or valid)
            with self.assertRaises(UserError):
                consolidated_invoice.unlink()
            # We cancel it
            cancellation_wizard = self.env['myinvois.document.status.update.wizard'].with_context(
                default_document_id=consolidated_invoice.id, default_new_status='cancelled',
            ).create({'reason': 'Test'})
            with patch(CONTACT_PROXY_METHOD, new=self._mock_successful_submission):
                cancellation_wizard.button_request_update()
            # We can unlink after cancellation
            consolidated_invoice.unlink()
            self.assertFalse(consolidated_invoice.exists())

    @mute_logger('odoo.addons.point_of_sale.models.pos_order')
    def test_09_nothing_to_consolidate(self):
        with freeze_time("2025-01-01"):
            with self.with_pos_session():
                self._create_order({'pos_order_lines_ui_args': [(self.product_one, 1.0)]})
                wizard = self.env['myinvois.consolidate.invoice.wizard'].create({
                    'date_from': '2025-01-01',
                    'date_to': '2025-01-31',
                })
                # As the session isn't closed yet, the order isn't available to consolidate so we raise an exception.
                with self.assertRaises(ValidationError):
                    wizard.button_consolidate_orders()

    #########
    # Refunds
    #########

    @mute_logger('odoo.addons.point_of_sale.models.pos_order')
    def test_10_refund_order(self):
        with freeze_time("2025-01-01"):
            # Create the orders
            with self.with_pos_session():
                first_order = self._create_order({'pos_order_lines_ui_args': [(self.product_one, 1.0)]})
                self._create_order({'pos_order_lines_ui_args': [(self.product_two, 1.0)]})
            with self.with_pos_session():
                self._create_order({
                    'pos_order_lines_ui_args': [
                        {
                            'product': self.product_one,
                            'quantity': -1.0,  # Refund 1 unit of product_b
                            'refunded_orderline_id': first_order.lines[0].id,
                        },
                    ],
                })
            wizard = self.env['myinvois.consolidate.invoice.wizard'].create({
                'date_from': '2025-01-01',
                'date_to': '2025-01-31',
            })
            wizard.button_consolidate_orders()
            consolidated_invoice = self.env['myinvois.document'].search([])
            consolidated_invoice.action_generate_xml_file()
            xml_tree = etree.fromstring(consolidated_invoice.myinvois_file_id.raw)
            self.assertEqual(len(xml_tree.xpath("cac:InvoiceLine", namespaces=NS_MAP)), 1)
            # The refunded order and its refund has been excluded from the line.
            self._assert_node_values(xml_tree, "cac:InvoiceLine/cbc:LineExtensionAmount", '500.00')

    @mute_logger('odoo.addons.point_of_sale.models.pos_order')
    def test_11_refund_order_partially(self):
        with freeze_time("2025-01-01"):
            # Create the orders
            with self.with_pos_session():
                first_order = self._create_order({'pos_order_lines_ui_args': [(self.product_one, 2.0)]})
                self._create_order({'pos_order_lines_ui_args': [(self.product_two, 1.0)]})
            with self.with_pos_session():
                self._create_order({
                    'pos_order_lines_ui_args': [
                        {
                            'product': self.product_one,
                            'quantity': -1.0,  # Refund 1 unit of product_b
                            'refunded_orderline_id': first_order.lines[0].id,
                        },
                    ],
                })
            wizard = self.env['myinvois.consolidate.invoice.wizard'].create({
                'date_from': '2025-01-01',
                'date_to': '2025-01-31',
            })
            wizard.button_consolidate_orders()
            consolidated_invoice = self.env['myinvois.document'].search([])
            consolidated_invoice.action_generate_xml_file()
            xml_tree = etree.fromstring(consolidated_invoice.myinvois_file_id.raw)
            self.assertEqual(len(xml_tree.xpath("cac:InvoiceLine", namespaces=NS_MAP)), 1)
            # The refunded amount is removed from the line
            self._assert_node_values(xml_tree, "cac:InvoiceLine/cbc:LineExtensionAmount", '600.00')

    @mute_logger('odoo.addons.point_of_sale.models.pos_order', 'odoo.addons.point_of_sale.models.pos_session')
    def test_12_refund_constrains_consolidated_invoice(self):
        with freeze_time("2025-01-01"):
            # Create the orders
            with self.with_pos_session():
                first_order = self._create_order({'pos_order_lines_ui_args': [(self.product_one, 2.0)]})
            wizard = self.env['myinvois.consolidate.invoice.wizard'].create({
                'date_from': '2025-01-01',
                'date_to': '2025-01-31',
            })
            wizard.button_consolidate_orders()
            consolidated_invoice = self.env["myinvois.document"].search([])
            with patch(CONTACT_PROXY_METHOD, new=self._mock_successful_submission):
                consolidated_invoice.action_submit_to_myinvois()
            with self.with_pos_session(), patch(CONTACT_PROXY_METHOD, new=self._mock_successful_submission):
                # Fails, the order should be invoiced in such a case
                with self.assertRaises(UserError):
                    self._create_order({
                        'pos_order_lines_ui_args': [
                            {
                                'product': self.product_one,
                                'quantity': -1.0,  # Refund 1 unit of product_b
                                'refunded_orderline_id': first_order.lines[0].id,
                            },
                        ],
                    })
                # If invoicing is checked, it will fail if the partner isn't the general public
                with self.assertRaises(UserError):
                    self._create_order({
                        'pos_order_lines_ui_args': [
                            {
                                'product': self.product_one,
                                'quantity': -1.0,  # Refund 1 unit of product_b
                                'refunded_orderline_id': first_order.lines[0].id,
                            },
                        ], 'customer': self.invoicing_customer, 'is_invoiced': True,
                    })
                # But will work when it is
                self.invoicing_customer.vat = 'EI00000000010'
                self._create_order({
                    'pos_order_lines_ui_args': [
                        {
                            'product': self.product_one,
                            'quantity': -1.0,  # Refund 1 unit of product_b
                            'refunded_orderline_id': first_order.lines[0].id,
                        },
                    ], 'customer': self.invoicing_customer, 'is_invoiced': True,
                })

    @mute_logger('odoo.addons.point_of_sale.models.pos_order', 'odoo.addons.point_of_sale.models.pos_session')
    def test_13_refund_constrains_regular_invoice(self):
        with freeze_time("2025-01-01"):
            # Create the orders
            with self.with_pos_session(), patch(CONTACT_PROXY_METHOD, new=self._mock_successful_submission):
                first_order = self._create_order({'pos_order_lines_ui_args': [(self.product_one, 2.0)], 'customer': self.invoicing_customer, 'is_invoiced': True})

            with self.with_pos_session(), patch(CONTACT_PROXY_METHOD, new=self._mock_successful_submission):
                # Fails, the order should be invoiced in such a case
                with self.assertRaises(UserError):
                    self._create_order({
                        'pos_order_lines_ui_args': [
                            {
                                'product': self.product_one,
                                'quantity': -1.0,  # Refund 1 unit of product_b
                                'refunded_orderline_id': first_order.lines[0].id,
                            },
                        ],
                    })
                # If invoicing is checked, it will work.
                self._create_order({
                    'pos_order_lines_ui_args': [
                        {
                            'product': self.product_one,
                            'quantity': -1.0,  # Refund 1 unit of product_b
                            'refunded_orderline_id': first_order.lines[0].id,
                        },
                    ], 'customer': self.invoicing_customer, 'is_invoiced': True,
                })

    @mute_logger('odoo.addons.point_of_sale.models.pos_order', 'odoo.addons.point_of_sale.models.pos_session')
    def test_14_refund_constrains_not_submitted(self):
        with freeze_time("2025-01-01"):
            # Create the orders
            with self.with_pos_session():
                first_order = self._create_order({'pos_order_lines_ui_args': [(self.product_one, 2.0)]})
            with self.with_pos_session(), patch(CONTACT_PROXY_METHOD, new=self._mock_successful_submission):
                # Fails, you shouldn't invoice an order that hasn't been sent to myinvois yet.
                with self.assertRaises(UserError):
                    self._create_order({
                        'pos_order_lines_ui_args': [
                            {
                                'product': self.product_one,
                                'quantity': -1.0,  # Refund 1 unit of product_b
                                'refunded_orderline_id': first_order.lines[0].id,
                            },
                        ], 'customer': self.invoicing_customer, 'is_invoiced': True,
                    })
                self._create_order({
                    'pos_order_lines_ui_args': [
                        {
                            'product': self.product_one,
                            'quantity': -1.0,  # Refund 1 unit of product_b
                            'refunded_orderline_id': first_order.lines[0].id,
                        },
                    ],
                })

    #################
    # Patched methods
    #################

    def _mock_successful_submission(self, endpoint, params):
        """ Mock a simple successful submission of N documents, matching the amount of documents in the params. """
        # Store the uuid/long_id in the params['documents'] so that we can more easily build the results.
        if endpoint == 'api/l10n_my_edi/1/submit_invoices':
            for i, document in enumerate(params['documents']):
                document['uuid'] = f'12345897451351{8 + i}'
                document['long_id'] = f'123-789-65{4 + i}'

            return {
                'submission_uid': '123456789',
                'documents': [{
                    'move_id': document['move_id'],
                    'uuid': document['uuid'],
                    'success': True,
                } for document in params['documents']],
            }
        if endpoint == 'api/l10n_my_edi/1/get_submission_statuses':
            return {
                'statuses': {
                    f'12345897451351{8 + i}': {
                        'status': 'valid',
                        'reason': '',
                        'long_id': f'123-789-65{4 + i}',
                        'valid_datetime': '2025-01-01T01:00:00Z',
                    } for i in range(10)
                },
                'document_count': 10,
            }
        if endpoint == 'api/l10n_my_edi/1/update_status':
            return {
                'success': True,
            }
        raise UserError('Unexpected endpoint called during a test: %s with params %s.' % (endpoint, params))

    #########
    # Helpers
    #########

    @contextmanager
    def with_pos_session(self):
        session = self.open_new_session(0.0)
        yield session
        session.post_closing_cash_details(0.0)
        session.close_session_from_ui()

    def _create_order(self, ui_data):
        return next(iter(self._create_orders([ui_data]).values()))

    def _assert_node_values(self, root, node_path, text, attributes=None):
        node = root.xpath(node_path, namespaces=NS_MAP)

        assert node, f'The requested node has not been found: {node_path}'

        self.assertEqual(
            node[0].text,
            text,
        )
        if attributes:
            for attribute, value in attributes.items():
                self.assertEqual(
                    node[0].attrib[attribute],
                    value,
                )
