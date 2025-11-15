import re
from unittest import skip

import logging

from odoo.addons.account.tests.common import AccountTestInvoicingCommon, AccountTestInvoicingHttpCommon

from odoo.exceptions import UserError
from odoo.fields import Command
from odoo.tests import tagged, new_test_user

_logger = logging.getLogger(__name__)


@tagged('post_install', '-at_install')
class TestAuditTrail(AccountTestInvoicingCommon):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env = cls.env['base'].with_context(
            tracking_disable=False,
            mail_create_nolog=False,
            mail_notrack=False,
        ).env
        cls.env.company.restrictive_audit_trail = False
        cls.move = cls.create_move()

    @classmethod
    def create_move(cls):
        return cls.env['account.move'].create({
            'date': '2021-04-01',
            'line_ids': [
                Command.create({
                    'balance': 100,
                    'account_id': cls.company_data['default_account_revenue'].id
                }),
                Command.create({
                    'balance': -100,
                    'account_id': cls.company_data['default_account_revenue'].id
                }),
            ],
        })

    def get_trail(self, record):
        self.env.cr.precommit.run()
        return self.env['mail.message'].search([
            ('model', '=', record._name),
            ('res_id', '=', record.id),
        ])

    def assertTrail(self, trail, expected):
        self.assertEqual(len(trail), len(expected))
        for message, expected_needle in zip(trail, expected[::-1]):
            self.assertIn(expected_needle, message.body)

    def test_can_unlink_draft(self):
        self.env.company.restrictive_audit_trail = True
        self.move.unlink()

    def test_cant_unlink_posted(self):
        self.env.company.restrictive_audit_trail = True
        self.move.action_post()
        self.move.button_draft()
        with self.assertRaisesRegex(UserError, "remove parts of a restricted audit trail"):
            self.move.unlink()

    def test_cant_unlink_message(self):
        self.env.company.restrictive_audit_trail = True
        self.move.action_post()
        audit_trail = self.get_trail(self.move)
        with self.assertRaisesRegex(UserError, "remove parts of a restricted audit trail"):
            audit_trail.unlink()

    def test_cant_unown_message(self):
        self.env.company.restrictive_audit_trail = True
        self.move.action_post()
        audit_trail = self.get_trail(self.move)
        with self.assertRaisesRegex(UserError, "remove parts of a restricted audit trail"):
            audit_trail.res_id = 0

    @skip('Skipped for now as the tracking message is in the body')
    def test_cant_unlink_tracking_value(self):
        self.env.company.restrictive_audit_trail = True
        self.move.action_post()
        self.env.cr.precommit.run()
        self.move.name = 'track this!'
        audit_trail = self.get_trail(self.move)
        trackings = audit_trail.tracking_value_ids.sudo()
        self.assertTrue(trackings)
        with self.assertRaisesRegex(UserError, "remove parts of a restricted audit trail"):
            trackings.unlink()

    def _assert_contains_all(self, body, substrings):
        for sub in substrings:
            self.assertIn(sub, body)

    def _assert_tracking(self, body, old, new, field):
        self._assert_contains_all(body, [
            f'<span class="o-mail-Message-trackingOld text-muted fw-bold">{old}</span>',
            f'<span class="o-mail-Message-trackingNew me-1 fw-bold text-info">{new}</span>',
            f'<span class="o-mail-Message-trackingField ms-1 fst-italic text-muted">({field})</span>',
        ])

    def _assert_journal_item(self, body, action):
        self._assert_contains_all(body, [
            'Journal Item',
            'account.move.line',
            action,
        ])

    def _assert_deleted_items(self, messages):
        '''
        Message:
            <p>Journal Item <a href="#" data-oe-model="account.move.line" data-oe-id="528">#528</a> deleted</p>
        '''
        for message in messages:
            self.assertIn("deleted", message.body)
            match = re.search(r'data-oe-id="(\d+)"', message.body)
            self.assertIsNotNone(match, "Missing data-oe-id")
            line_id = match.group(1)
            self.assertIn(f">#{line_id}<", message.body)

    @skip('Skipped for now as the tracking message is in the body')
    def test_content(self):
        messages = ["Journal Entry created"]
        self.assertTrail(self.get_trail(self.move), messages)

        # 1. post move
        self.move.action_post()
        body = self.get_trail(self.move)[0].body

        self._assert_tracking(body, "Draft", "Posted", "Status")
        self._assert_tracking(body, "None", "MISC/2021/04/0001", "Number")

        # 2. back to draft
        self.move.button_draft()
        body = self.get_trail(self.move)[0].body

        self._assert_tracking(body, "Posted", "Draft", "Status")

        # 3. name change
        self.move.name = "nawak"
        body = self.get_trail(self.move)[0].body

        self._assert_tracking(body, "MISC/2021/04/0001", "nawak", "Number")

        # 4. move line update and create
        self.move.line_ids = [
            Command.update(self.move.line_ids[0].id, {'balance': 300}),
            Command.update(self.move.line_ids[1].id, {'credit': 200}),
            Command.create({
                'balance': -100,
                'account_id': self.company_data['default_account_revenue'].id,
            })
        ]
        messages = self.get_trail(self.move)
        self.assertIn('created', messages[0].body)
        self.assertIn('updated', messages[1].body)
        self.assertIn('updated', messages[2].body)

        # 5. tax changes -> journal item creation
        self.move.line_ids[0].tax_ids = self.env.company.account_purchase_tax_id
        messages = self.get_trail(self.move)

        self._assert_journal_item(messages[0].body, 'created')
        self._assert_journal_item(messages[1].body, 'created')
        self._assert_journal_item(messages[2].body, 'updated')

        # 6.delete all move lines
        self.move.with_context(dynamic_unlink=True).line_ids.unlink()
        messages = self.get_trail(self.move)
        self._assert_deleted_items(messages[:5])

        # 7. company setting update
        self.env.company.restrictive_audit_trail = True
        body = self.get_trail(self.company)[0].body

        self.assertIn(
            '<span class="o-mail-Message-trackingField ms-1 fst-italic text-muted">(Restrictive Audit Trail)</span>',
            body
        )

    def test_partner_notif(self):
        """Audit trail should not block partner notification."""
        user = new_test_user(
            self.env, 'test-user-notif', groups="base.group_portal",
            notification_type='email',
        )
        # identify that user as being a customer
        user.partner_id.sudo().customer_rank += 1
        self.assertGreater(user.partner_id.customer_rank, 0)
        user.partner_id.message_post(body='Test', partner_ids=user.partner_id.ids)

    def test_partner_unlink(self):
        """Audit trail should not block partner unlink if they didn't create moves"""
        partner = self.env['res.partner'].create({
            'name': 'Test',
            'customer_rank': 1,
        })
        partner.unlink()


@tagged('post_install', '-at_install')
class TestAuditTrailAttachment(AccountTestInvoicingHttpCommon):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env.company.restrictive_audit_trail = True
        cls.document_installed = 'documents_account' in cls.env['ir.module.module']._installed()
        if cls.document_installed:
            folder_test = cls.env['documents.document'].create({
                'name': 'folder_test',
                'type': 'folder',
            })
            existing_setting = cls.env['documents.account.folder.setting'].sudo().search(
                [('journal_id', '=', cls.company_data['default_journal_sale'].id)])
            if existing_setting:
                existing_setting.folder_id = folder_test
            else:
                cls.env['documents.account.folder.setting'].sudo().create({
                    'folder_id': folder_test.id,
                    'journal_id': cls.company_data['default_journal_sale'].id,
                })

    def _send_and_print(self, invoice):
        return self.env['account.move.send'].with_context(
            force_report_rendering=True,
        )._generate_and_send_invoices(invoice)

    def test_audit_trail_attachment(self):
        invoice = self.env['account.move'].create([{
            'move_type': 'out_invoice',
            'partner_id': self.partner_a.id,
            'invoice_line_ids': [Command.create({
                'name': 'product',
                'quantity': 1,
                'price_unit': 100,
            })],
        }])
        invoice.action_post()
        self.assertFalse(invoice.message_main_attachment_id)

        # Print the invoice for the first time
        first_attachment = self._send_and_print(invoice)
        self.assertTrue(first_attachment)

        # Remove the attachment, it should only archive it instead of deleting it
        first_attachment.unlink()
        self.assertTrue(first_attachment.exists())
        # But we cannot entirely remove it
        with self.assertRaisesRegex(UserError, "remove parts of a restricted audit trail."):
            first_attachment.unlink()

        # Print a second time the invoice, it generates a new attachment
        invoice.invalidate_recordset()
        second_attachment = self._send_and_print(invoice)
        self.assertNotEqual(first_attachment, second_attachment)

        # Make sure we can browse all the attachments in the UI (as it changes the main attachment)
        first_attachment.register_as_main_attachment()
        self.assertEqual(invoice.message_main_attachment_id, first_attachment)
        second_attachment.register_as_main_attachment()
        self.assertEqual(invoice.message_main_attachment_id, second_attachment)

        if self.document_installed:
            # Make sure we can change the version history of the document
            document = self.env['documents.document'].search([
                ('res_model', '=', 'account.move'),
                ('res_id', '=', invoice.id),
                ('name', '=ilike', '%.pdf'),
            ])
            self.assertTrue(document)
            document.attachment_id = first_attachment
            document.attachment_id = second_attachment
        else:
            _logger.runbot("Documents module is not installed, skipping part of the test")

    def test_audit_trail_write_attachment(self):
        invoice = self.env['account.move'].create([{
            'move_type': 'out_invoice',
            'partner_id': self.partner_a.id,
            'invoice_line_ids': [Command.create({
                'name': 'product',
                'quantity': 1,
                'price_unit': 100,
            })],
        }])
        invoice.action_post()
        self.assertFalse(invoice.message_main_attachment_id)

        # Print the invoice for the first time
        self._send_and_print(invoice)
        attachment = invoice.message_main_attachment_id

        with self.assertRaisesRegex(UserError, "remove parts of a restricted audit trail."):
            attachment.write({
                'res_id': self.env.user.id,
                'res_model': self.env.user._name,
            })

        with self.assertRaisesRegex(UserError, "remove parts of a restricted audit trail."):
            attachment.datas = b'new data'

        # Adding an attachment to the log notes should be allowed
        another_attachment = self.env['ir.attachment'].create({
            'name': 'doc.pdf',
            'res_model': 'mail.compose.message',
            # Ensures a bytes-like object with guessed mimetype = 'application/pdf' (checked in _except_audit_trail())
            'datas': attachment.datas,
        })
        invoice.message_post(message_type='comment', attachment_ids=another_attachment.ids)
