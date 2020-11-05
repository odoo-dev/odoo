# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from unittest.mock import patch, call, ANY

from odoo.addons.test_mail_full.tests.common import TestMailFullCommon
from odoo.tests.common import users
from odoo.tools import config, mute_logger, TestingSMTPSession, MockValidator
from odoo.tests import tagged


@tagged('mass_mailing')
class TestMassMailing(TestMailFullCommon):

    @classmethod
    def setUpClass(cls):
        super(TestMassMailing, cls).setUpClass()

        cls.env['ir.config_parameter'].sudo().set_param('mail.catchall.domain', 'odoo.com')
        cls.env['ir.config_parameter'].sudo().set_param('mail.default.from', 'notifications')
        ir_mail_server_values = {
            'smtp_host': 'smtp_host',
            'smtp_encryption': 'none',
        }
        cls.env['ir.mail_server'].create([
            {
                'name': 'Server Odoo',
                'from_filter': 'odoo.com',
                ** ir_mail_server_values,
            }, {
                'name': 'Server STD account',
                'from_filter': 'std@odoo.com',
                ** ir_mail_server_values,
            },  {
                'name': 'Server Notifications',
                'from_filter': 'notifications@odoo.com',
                ** ir_mail_server_values,
            },  {
                'name': 'Server No From Filter',
                'from_filter': False,
                ** ir_mail_server_values,
            },
        ])

    @users('user_marketing')
    @mute_logger('odoo.addons.mail.models.mail_mail')
    def test_mailing_w_blacklist_opt_out(self):
        # TDE FIXME: better URLs check for unsubscribe / view (res_id + email + correct parse of url)
        mailing = self.mailing_bl.with_user(self.env.user)

        jinja_html = '''
<div>
    <p>Hello <span class="text-muted">${object.name}</span></p>
    <p>
        Here are your personal links
        <a href="http://www.example.com">External link</a>
        <a href="/event/dummy-event-0">Internal link</a>
        <a role="button" href="/unsubscribe_from_list" class="btn btn-link">Unsubscribe link</a>
        <a href="/view">
            View link
        </a>
    </p>
</div>'''

        mailing.write({
            'preview': 'Hi ${object.name} :)',
            'body_html': jinja_html,
            'mailing_model_id': self.env['ir.model']._get('mailing.test.optout').id,
        })
        recipients = self._create_test_blacklist_records(model='mailing.test.optout', count=10)

        # optout records 1 and 2
        (recipients[1] | recipients[2]).write({'opt_out': True})
        # blacklist records 3 and 4
        self.env['mail.blacklist'].create({'email': recipients[3].email_normalized})
        self.env['mail.blacklist'].create({'email': recipients[4].email_normalized})

        mailing.write({'mailing_domain': [('id', 'in', recipients.ids)]})
        mailing.action_put_in_queue()
        with self.mock_mail_gateway(mail_unlink_sent=False):
            mailing._process_mass_mailing_queue()

        for recipient in recipients:
            recipient_info = {
                'email': recipient.email_normalized,
                'content': 'Hello <span class="text-muted">%s</span' % recipient.name}
            if recipient in recipients[1] | recipients[2]:
                recipient_info['state'] = 'ignored'
            elif recipient in recipients[3] | recipients[4]:
                recipient_info['state'] = 'ignored'
            else:
                email = self._find_sent_mail_wemail(recipient.email_normalized)
                # preview correctly integrated rendered jinja
                self.assertIn(
                    'Hi %s :)' % recipient.name,
                    email['body'])
                # rendered unsubscribe
                self.assertIn(
                    'http://localhost:%s/mail/mailing/%s/unsubscribe' % (config['http_port'], mailing.id),
                    email['body'])
                # rendered view
                self.assertIn(
                    'http://localhost:%s/mailing/%s/view' % (config['http_port'], mailing.id),
                    email['body'])

            self.assertMailTraces([recipient_info], mailing, recipient, check_mail=True)

        self.assertEqual(mailing.ignored, 4)

    def test_mass_mailing_server_choice(self):
        """Test that the right mail server is chosen to send the mailing.

        Test also the envelop and the SMTP headers.
        """
        IrMailServer = type(self.env['ir.mail_server'])
        find_mail_server = self.env['ir.mail_server']._find_mail_server

        # Sanity check
        self.assertEqual(self.env['ir.mail_server'].search_count([]), 4)

        # Send one mailing
        mailing = self.env['mailing.mailing'].create({
            'subject': 'Mailing',
            'email_from': 'std@odoo.com',
        })
        with patch.object(TestingSMTPSession, 'send_email') as send_email, \
             patch.object(IrMailServer, '_find_mail_server', side_effect=find_mail_server) as patched_find_mail_server:
            mailing.action_send_mail()
        self.assertEqual(patched_find_mail_server.call_count, 1, 'Must be called only once')
        send_email.assert_called_with(
            smtp_from='std@odoo.com',
            smtp_to_list=ANY,
            message_from='std@odoo.com',
            from_filter='std@odoo.com',
        )

        # Test sending mailing in batch
        mailings = self.env['mailing.mailing'].create([{
            'subject': 'Mailing',
            'email_from': 'std@odoo.com',
        }, {
            'subject': 'Mailing',
            'email_from': 'sqli@odoo.com',
        }])
        with patch.object(TestingSMTPSession, 'send_email') as send_email, \
             patch.object(IrMailServer, '_find_mail_server', side_effect=find_mail_server) as patched_find_mail_server:
            mailings.action_send_mail()
        self.assertEqual(patched_find_mail_server.call_count, 2, 'Must be called only once per mail from')
        send_email.assert_has_calls(
            calls=[
                call(
                    smtp_from='std@odoo.com',
                    smtp_to_list=ANY,
                    message_from='std@odoo.com',
                    from_filter='std@odoo.com',
                ), call(
                    # Must use the bounce address here because the mail server
                    # is configured for the entire domain "odoo.com"
                    smtp_from=MockValidator(lambda x: 'bounce' in x),
                    smtp_to_list=ANY,
                    message_from='sqli@odoo.com',
                    from_filter='odoo.com',
                ),
            ],
            any_order=True,
        )

        # We force a mail server on one mailing
        mailings = self.env['mailing.mailing'].create([{
            'subject': 'Mailing',
            'email_from': 'std@odoo.com',
        }, {
            'subject': 'Mailing',
            'email_from': 'test_force_mail_server@gmail.com',
            'mail_server_id': self.env['ir.mail_server'].search([('from_filter', '=', 'notifications@odoo.com')]).id,
        }])
        with patch.object(TestingSMTPSession, 'send_email') as send_email, \
             patch.object(IrMailServer, '_find_mail_server', side_effect=find_mail_server) as patched_find_mail_server:
            mailings.action_send_mail()
        self.assertEqual(patched_find_mail_server.call_count, 1, 'Must not be called when mail server is forced')
        send_email.assert_has_calls(
            calls=[
                call(
                    smtp_from='std@odoo.com',
                    smtp_to_list=ANY,
                    message_from='std@odoo.com',
                    from_filter='std@odoo.com',
                ), call(
                    # The mail server is forced, we do not change the SMTP headers / envelop
                    smtp_from='test_force_mail_server@gmail.com',
                    smtp_to_list=ANY,
                    message_from='test_force_mail_server@gmail.com',
                    from_filter='notifications@odoo.com',
                ),
            ],
            any_order=True,
        )

        # We do not have a mail server for this address email, so fall back to the
        # "notifications@domain" email.
        mailings = self.env['mailing.mailing'].create([{
            'subject': 'Mailing',
            'email_from': '"Testing" <unknow_email@unknow_domain.com>',
        }])
        with patch.object(TestingSMTPSession, 'send_email') as send_email, \
             patch.object(IrMailServer, '_find_mail_server', side_effect=find_mail_server) as patched_find_mail_server:
            mailings.action_send_mail()
        self.assertEqual(patched_find_mail_server.call_count, 1)
        send_email.assert_called_with(
            smtp_from='notifications@odoo.com',
            smtp_to_list=ANY,
            message_from='"Testing (unknow_email@unknow_domain.com)" <notifications@odoo.com>',
            from_filter='notifications@odoo.com',
        )
