import json
from email.message import EmailMessage

from odoo import Command
from odoo.addons.mail.tests.common import MailCommon
from odoo.addons.test_mail.tests.test_mail_gateway import MailGatewayCommon
from odoo.tests import tagged


def _create_ses_bounce_notification(
    bounced_email,
    message_id=None,
    bounce_type='Permanent',
    bounce_subtype='General',
    notification_type='Bounce',
    bounced_recipients_list=None,
    malformed=False,
):
    """
    Factory method to create SES bounce notification emails.
    This is a standalone helper to be used by multiple test classes.
    """
    email_msg = EmailMessage()
    email_msg['X-Amz-Sns-Message-Id'] = f'sns-{hash(bounced_email)}'
    email_msg['From'] = 'no-reply@sns.amazonaws.com'
    email_msg['Subject'] = 'Amazon SES Notification'
    email_msg['Content-Type'] = 'application/json'

    headers = [
        {'name': 'From', 'value': 'sender@odoo.com'},
        {'name': 'To', 'value': bounced_email},
        {'name': 'Subject', 'value': 'Test Email'},
    ]

    if message_id:
        headers.append({'name': 'Message-Id', 'value': message_id})

    if bounced_recipients_list is None:
        recipients = [
            {
                'emailAddress': bounced_email,
                'action': 'failed',
                'status': '5.1.1',
                'diagnosticCode': 'smtp; 550 5.1.1 user unknown',
            }
        ]
    else:
        recipients = bounced_recipients_list

    bounce_data = {
        'notificationType': notification_type,
        'bounce': {
            'bounceType': bounce_type,
            'bounceSubType': bounce_subtype,
            'bouncedRecipients': recipients,
            'timestamp': '2024-01-15T12:00:00.000Z',
            'feedbackId': 'ses-feedback-123456',
        },
        'mail': {
            'timestamp': '2024-01-15T11:59:55.000Z',
            'source': 'sender@odoo.com',
            'messageId': 'ses-message-id-xyz',
            'destination': [bounced_email],
            'headers': headers,
        },
    }

    sns_notification = {
        'Type': 'Notification',
        'MessageId': f'sns-{hash(bounced_email)}',
        'TopicArn': 'arn:aws:sns:us-east-1:123456789:ses-bounces',
        'Message': json.dumps(bounce_data) if not malformed else 'invalid json',
        'Timestamp': '2024-01-15T12:00:01.000Z',
    }

    email_msg.set_content(json.dumps(sns_notification))
    return email_msg


@tagged('post_install', '-at_install', 'mail_bounce')
class TestSESBounceParsing(MailCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.bounce_partner = cls.env['res.partner'].create({
            'name': 'Bounce Partner',
            'email': 'bounce@example.com',
        })

        cls.test_record = cls.env['mail.test.simple'].create({'name': 'Test Record'})

        cls.test_message = cls.env['mail.message'].create({
            'model': 'mail.test.simple',
            'res_id': cls.test_record.id,
            'subject': 'Test Message',
            'message_id': '<test.message.123@odoo.com>',
            'notification_ids': [
                Command.create({
                    'res_partner_id': cls.bounce_partner.id,
                    'notification_status': 'sent',
                })
            ],
        })

    def test_ses_bounce_parsing_basic(self):
        """Test parsing of a basic SES bounce notification."""
        email_msg = _create_ses_bounce_notification(
            'bounce@example.com',
            message_id='<test.message.123@odoo.com>',
        )

        result = self.env['mail.thread'].message_parse(email_msg)

        self.assertTrue(result.get('is_bounce'))
        self.assertEqual(result.get('bounced_email'), 'bounce@example.com')
        self.assertEqual(result.get('bounced_partner'), self.bounce_partner)

    def test_ses_bounce_message_matching(self):
        """Test that bounces are matched to original messages via message_parse."""
        email_msg = _create_ses_bounce_notification(
            'bounce@example.com',
            message_id=self.test_message.message_id,
        )

        result = self.env['mail.thread'].message_parse(email_msg)

        self.assertTrue(result.get('is_bounce'))
        self.assertEqual(result.get('bounced_message'), self.test_message)
        self.assertIn(self.test_message.message_id, result.get('bounced_msg_ids', []))

    def test_ses_bounce_unknown_partner(self):
        """Test bounce parsing for an email without a matching partner."""
        email_msg = _create_ses_bounce_notification(
            'unknown@nowhere.com',
            message_id='<unknown.message@odoo.com>',
        )

        result = self.env['mail.thread'].message_parse(email_msg)

        self.assertTrue(result.get('is_bounce'))
        self.assertEqual(result.get('bounced_email'), 'unknown@nowhere.com')
        self.assertFalse(result.get('bounced_partner'))

    def test_ses_malformed_json(self):
        """Test handling of malformed JSON in notification."""
        email_msg = _create_ses_bounce_notification(
            'bounce@example.com',
            malformed=True,
        )

        result = self.env['mail.thread'].message_parse(email_msg)
        self.assertFalse(result.get('is_bounce'))

    def test_ses_wrong_notification_type(self):
        """Test handling of non-bounce SES notifications (e.g., Complaint)."""
        email_msg = _create_ses_bounce_notification(
            'complaint@example.com',
            notification_type='Complaint'
        )

        result = self.env['mail.thread'].message_parse(email_msg)
        self.assertFalse(result.get('is_bounce'))

    def test_ses_empty_bounced_recipients(self):
        """Test handling of bounce with empty recipients list."""
        email_msg = _create_ses_bounce_notification(
            'test@example.com',
            bounced_recipients_list=[]
        )

        result = self.env['mail.thread'].message_parse(email_msg)
        self.assertFalse(result.get('is_bounce'))


@tagged('post_install', '-at_install', 'mail_bounce')
class TestSESBounceGateway(MailGatewayCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.bounce_partner = cls.env['res.partner'].create({
            'name': 'Gateway Bounce Partner',
            'email': 'gateway.bounce@example.com',
        })

        cls.test_record = cls.env['mail.test.gateway'].create({'name': 'Gateway Test Record'})

        cls.test_message = cls.env['mail.message'].create({
            'model': 'mail.test.gateway',
            'res_id': cls.test_record.id,
            'subject': 'Gateway Test Message',
            'message_id': '<gateway.message.789@odoo.com>',
            'notification_ids': [
                Command.create({
                    'res_partner_id': cls.bounce_partner.id,
                    'notification_status': 'sent',
                })
            ],
        })

        # Ensure the partner's bounce count is 0 before tests
        cls.bounce_partner.message_bounce = 0

    def test_ses_bounce_gateway_workflow(self):
        self.assertEqual(self.bounce_partner.message_bounce, 0)

        email_msg = _create_ses_bounce_notification(
            self.bounce_partner.email,
            message_id=self.test_message.message_id,
        )

        # Escape curly braces in JSON to safely use format_and_process
        record = self.format_and_process(
            email_msg.as_string().replace('{', '{{').replace('}', '}}'),
            email_msg['From'],
            f'bounce@{self.alias_domain}',
            subject=email_msg['Subject'],
        )

        self.assertFalse(record, "Bounce emails should not create new records.")

        self.assertEqual(
            self.bounce_partner.message_bounce, 1,
            "Partner's bounce count should be incremented."
        )

        notification = self.test_message.notification_ids.filtered(
            lambda n: n.res_partner_id == self.bounce_partner
        )
        self.assertEqual(notification.notification_status, 'bounce')
        self.assertEqual(notification.failure_type, 'mail_bounce')

    def test_ses_bounce_gateway_no_match(self):
        """Test gateway processing of a bounce with no matching message/partner."""
        unknown_partner_email = 'unknown.partner@example.com'

        unknown_partner = self.env['res.partner'].search([('email_normalized', '=', unknown_partner_email)])
        self.assertFalse(unknown_partner)

        email_msg = _create_ses_bounce_notification(
            unknown_partner_email,
            message_id='<some.unknown.message@odoo.com>',
        )

        # Escape curly braces in JSON to safely use format_and_process
        record = self.format_and_process(
            email_msg.as_string().replace('{', '{{').replace('}', '}}'),
            email_msg['From'],
            f'bounce@{self.alias_domain}',
            subject=email_msg['Subject'],
        )

        self.assertFalse(record)

        # Verify the partner was NOT created
        unknown_partner = self.env['res.partner'].search([('email_normalized', '=', unknown_partner_email)])
        self.assertFalse(unknown_partner)
