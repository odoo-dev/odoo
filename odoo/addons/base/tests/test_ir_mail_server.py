# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from unittest.mock import patch, ANY

from odoo.addons.base.models.ir_mail_server import extract_rfc2822_addresses
from odoo.tests.common import TransactionCase
from odoo.tools import mute_logger, TestingSMTPSession


class TestIrMailServer(TransactionCase):
    def setUp(self):
        super(TestIrMailServer, self).setUp()
        self.env['ir.config_parameter'].sudo().set_param('mail.catchall.domain', 'odoo.com')
        self.env['ir.config_parameter'].sudo().set_param('mail.default.from', 'notifications')
        self.env['ir.config_parameter'].sudo().set_param('mail.bounce.alias', 'bounce')

        ir_mail_server_values = {
            'smtp_host': 'smtp_host',
            'smtp_encryption': 'none',
        }
        self.env['ir.mail_server'].search([]).unlink()
        self.env['ir.mail_server'].create([
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

    def test_extract_rfc2822_addresses(self):
        result = extract_rfc2822_addresses('"Admin" <admin@gmail.com>')
        self.assertEqual(result, ['admin@gmail.com'])
        result = extract_rfc2822_addresses('"Admin" <admin@gmail.com>, Demo <demo@odoo.com>')
        self.assertEqual(result, ['admin@gmail.com', 'demo@odoo.com'])

    def test_match_from_filter(self):
        """Test the from_filter field on the "ir.mail_server"."""
        match_from_filter = self.env['ir.mail_server']._match_from_filter
        res = match_from_filter('admin@gmail.com', 'gmail.com')
        self.assertTrue(res)
        res = match_from_filter('admin@gmail.com', 'admin@gmail.com')
        self.assertTrue(res)
        res = match_from_filter('admin@gmail.com', False)
        self.assertTrue(res)
        res = match_from_filter('"fake@odoo.com" <admin@gmail.com>', 'gmail.com')
        self.assertTrue(res)
        res = match_from_filter('"fake@odoo.com" <ADMIN@GMAIL.COM>', 'gmail.com')
        self.assertTrue(res)

        res = match_from_filter('admin@gmail.com', 'test@gmail.com')
        self.assertFalse(res)
        res = match_from_filter('admin@gmail.com', 'odoo.com')
        self.assertFalse(res)
        res = match_from_filter('"admin@gmail.com" <fake@odoo.com>', 'gmail.com')
        self.assertFalse(res)

    def test_mail_server_priorities(self):
        """Test if we choose the right mail server to send an email.

        Priorities are
        1. Forced mail server (e.g.: in mass mailing)
            - If the "from_filter" of the mail server match the notification email
              use the notifications email in the "From header"
            - Otherwise spoof the "From" (because we force the mail server but we don't
              know which email use to send it)
        2. A mail server for which the "from_filter" match the "From" header
        3. A mail server for which the "from_filter" match the domain of the "From" header
        4. The mail server used for notifications
        5. A mail server without "from_filter" (and so spoof the "From" header because we
           do not know for which email address it can be used)
        """
        # sanity checks
        self.assertTrue(self.env['ir.mail_server']._get_default_from_address(), 'Notifications email must be set for testing')
        self.assertTrue(self.env['ir.mail_server']._get_default_bounce_address(), 'Bounce email must be set for testing')

        mail_server, mail_from = self.env['ir.mail_server']._find_mail_server(mail_from='std@odoo.com')
        self.assertEqual(mail_server.from_filter, 'std@odoo.com')
        self.assertEqual(mail_from, 'std@odoo.com')

        mail_server, mail_from = self.env['ir.mail_server']._find_mail_server(mail_from='"Name name@strange.name" <std@odoo.com>')
        self.assertEqual(mail_server.from_filter, 'std@odoo.com', 'Must extract email from full name')
        self.assertEqual(mail_from, '"Name name@strange.name" <std@odoo.com>', 'Must keep the given mail from')

        # Should not be case sensitive
        mail_server, mail_from = self.env['ir.mail_server']._find_mail_server(mail_from='sTd@oDoo.cOm')
        self.assertEqual(mail_server.from_filter, 'std@odoo.com', 'Mail from is case insensitive')
        self.assertEqual(mail_from, 'sTd@oDoo.cOm', 'Should not change the mail from')

        mail_server, mail_from = self.env['ir.mail_server']._find_mail_server(mail_from='XSS@odoo.com')
        self.assertEqual(mail_server.from_filter, 'odoo.com')
        self.assertEqual(mail_from, 'XSS@odoo.com')

        # Cover a different condition that the "email case insensitive" test
        mail_server, mail_from = self.env['ir.mail_server']._find_mail_server(mail_from='XSS@ODoO.cOm')
        self.assertEqual(mail_server.from_filter, 'odoo.com', 'Domain is case insensitive')
        self.assertEqual(mail_from, 'XSS@ODoO.cOm', 'Domain is case insensitive')

        mail_server, mail_from = self.env['ir.mail_server']._find_mail_server(mail_from='"Test" <XSS@gmail.com>')
        self.assertEqual(mail_server.from_filter, 'notifications@odoo.com', 'Should encapsulate the mail because it is sent from gmail')
        self.assertEqual(mail_from, '"Test (XSS@gmail.com)" <notifications@odoo.com>')

        # remove the notifications email to simulate a mis-configured Odoo database
        # so we do not have the choice, we have to spoof the FROM
        # (otherwise we can not send the email)
        self.env['ir.config_parameter'].sudo().set_param('mail.catchall.domain', False)
        with mute_logger('odoo.addons.base.models.ir_mail_server'):
            mail_server, mail_from = self.env['ir.mail_server']._find_mail_server(mail_from='XSS@gmail.com')
            self.assertEqual(mail_server.from_filter, False, 'No notifications email set, must be forced to spoof the FROM')
            self.assertEqual(mail_from, 'XSS@gmail.com')

    def test_mail_server_send_email(self):
        IrMailServer = self.env['ir.mail_server']
        default_bounce_adress = self.env['ir.mail_server']._get_default_bounce_address()

        # A mail server is configured for the email
        with patch.object(TestingSMTPSession, 'send_email') as send_email:
            message = self._build_email(mail_from='std@odoo.com')
            IrMailServer.send_email(message)

        send_email.assert_called_once_with(
            smtp_from='std@odoo.com',
            smtp_to_list=ANY,
            message_from='std@odoo.com',
            from_filter='std@odoo.com',
        )

        # No mail server are configured for the email address,
        # so it will use the notifications email instead and encapsulate the old email
        with patch.object(TestingSMTPSession, 'send_email') as send_email:
            message = self._build_email(mail_from='"STD" <std@gmail.com>')
            IrMailServer.send_email(message)

        send_email.assert_called_once_with(
            smtp_from='notifications@odoo.com',
            smtp_to_list=ANY,
            message_from='"STD (std@gmail.com)" <notifications@odoo.com>',
            from_filter='notifications@odoo.com',
        )

        # A mail server is configured for the entire domain name, so we can use the bounce
        # email address because the mail server supports it
        with patch.object(TestingSMTPSession, 'send_email') as send_email:
            message = self._build_email(mail_from='XSS@odoo.com')
            IrMailServer.send_email(message)

        send_email.assert_called_once_with(
            smtp_from=default_bounce_adress,
            smtp_to_list=ANY,
            message_from='XSS@odoo.com',
            from_filter='odoo.com',
        )

        # remove the notification server
        # so <notifications@odoo.com> will use the <odoo.com> mail server
        self.env['ir.mail_server'].search([('from_filter', '=', 'notifications@odoo.com')]).unlink()

        # The mail server configured for the notifications email has been removed
        # but we can still use the mail server configured for odoo.com
        # and so we will be able to use the bounce address
        # because we use the mail server for "odoo.com"
        with patch.object(TestingSMTPSession, 'send_email') as send_email:
            message = self._build_email(mail_from='"STD" <std@gmail.com>')
            IrMailServer.send_email(message)

        send_email.assert_called_once_with(
            smtp_from=default_bounce_adress,
            smtp_to_list=ANY,
            message_from='"STD (std@gmail.com)" <notifications@odoo.com>',
            from_filter='odoo.com',
        )

        # Test that the mail from / recipient envelop are encoded using IDNA
        self.env['ir.config_parameter'].sudo().set_param('mail.catchall.domain', 'ééééééé.com')
        with patch.object(TestingSMTPSession, 'send_email') as send_email:
            message = self._build_email(mail_from='XSS@ééééééé.com')
            IrMailServer.send_email(message)

        send_email.assert_called_once_with(
            smtp_from='bounce@xn--9caaaaaaa.com',
            smtp_to_list=['dest@xn--example--i1a.com'],
            message_from='XSS@ééééééé.com',
            from_filter=False,
        )

    def test_mail_server_send_email_smtp_session(self):
        """Test all the cases when we provide the SMTP session.

        The results must be the same as passing directly the parameter to "send_email".
        """
        IrMailServer = self.env['ir.mail_server']
        o_connect = IrMailServer.connect
        default_bounce_adress = self.env['ir.mail_server']._get_default_bounce_address()

        # A mail server is configured for the email
        with patch.object(TestingSMTPSession, 'send_email') as send_email, \
             patch.object(type(IrMailServer), 'connect', side_effect=o_connect) as connect:
            smtp_session = IrMailServer.connect(smtp_from='std@odoo.com')
            message = self._build_email(mail_from='std@odoo.com')
            IrMailServer.send_email(message, smtp_session=smtp_session)

        connect.assert_called_once()
        send_email.assert_called_once_with(
            smtp_from='std@odoo.com',
            smtp_to_list=ANY,
            message_from='std@odoo.com',
            from_filter='std@odoo.com',
        )

        # No mail server are configured for the email address,
        # so it will use the notifications email instead and encapsulate the old email
        with patch.object(TestingSMTPSession, 'send_email') as send_email, \
             patch.object(type(IrMailServer), 'connect', side_effect=o_connect) as connect:
            smtp_session = IrMailServer.connect(smtp_from='"STD" <std@gmail.com>')
            message = self._build_email(mail_from='"STD" <std@gmail.com>')
            IrMailServer.send_email(message, smtp_session=smtp_session)

        connect.assert_called_once()
        send_email.assert_called_once_with(
            smtp_from='notifications@odoo.com',
            smtp_to_list=ANY,
            message_from='"STD (std@gmail.com)" <notifications@odoo.com>',
            from_filter='notifications@odoo.com',
        )

        # A mail server is configured for the entire domain name, so we can use the bounce
        # email address because the mail server supports it
        with patch.object(TestingSMTPSession, 'send_email') as send_email, \
             patch.object(type(IrMailServer), 'connect', side_effect=o_connect) as connect:
            smtp_session = IrMailServer.connect(smtp_from='XSS@odoo.com')
            message = self._build_email(mail_from='XSS@odoo.com')
            IrMailServer.send_email(message, smtp_session=smtp_session)

        connect.assert_called_once()
        send_email.assert_called_once_with(
            smtp_from=default_bounce_adress,
            smtp_to_list=ANY,
            message_from='XSS@odoo.com',
            from_filter='odoo.com',
        )

        # remove the notification server
        # so <notifications@odoo.com> will use the <odoo.com> mail server
        self.env['ir.mail_server'].search([('from_filter', '=', 'notifications@odoo.com')]).unlink()

        # The mail server configured for the notifications email has been removed
        # but we can still use the mail server configured for odoo.com
        with patch.object(TestingSMTPSession, 'send_email') as send_email, \
             patch.object(type(IrMailServer), 'connect', side_effect=o_connect) as connect:
            smtp_session = IrMailServer.connect(smtp_from='"STD" <std@gmail.com>')
            message = self._build_email(mail_from='"STD" <std@gmail.com>')
            IrMailServer.send_email(message, smtp_session=smtp_session)

        connect.assert_called_once()
        send_email.assert_called_once_with(
            smtp_from=default_bounce_adress,
            smtp_to_list=ANY,
            message_from='"STD (std@gmail.com)" <notifications@odoo.com>',
            from_filter='odoo.com',
        )

    @patch.dict("odoo.tools.config.options", {"from_filter": "odoo.com"})
    def test_mail_server_binary_arguments_domain(self):
        """Test the configuration provided in the odoo-bin arguments.

        This config is used when no mail server exists.
        """
        IrMailServer = self.env['ir.mail_server']
        o_connect = IrMailServer.connect
        default_bounce_adress = self.env['ir.mail_server']._get_default_bounce_address()

        # Remove all mail server so we will use the odoo-bin arguments
        self.env['ir.mail_server'].search([]).unlink()
        self.assertFalse(self.env['ir.mail_server'].search([]))

        # Use an email in the domain of the "from_filter"
        with patch.object(TestingSMTPSession, 'send_email') as send_email, \
             patch.object(type(IrMailServer), 'connect', side_effect=o_connect) as connect:
            message = self._build_email(mail_from='std@odoo.com')
            IrMailServer.send_email(message)

        connect.assert_called_once()
        send_email.assert_called_once_with(
            smtp_from=default_bounce_adress,
            smtp_to_list=ANY,
            message_from='std@odoo.com',
            from_filter='odoo.com',
        )

        # Test if the domain name is normalized before comparison
        with patch.object(TestingSMTPSession, 'send_email') as send_email, \
             patch.object(type(IrMailServer), 'connect', side_effect=o_connect) as connect:
            message = self._build_email(mail_from='std@oDoo.cOm')
            IrMailServer.send_email(message)

        connect.assert_called_once()
        send_email.assert_called_once_with(
            smtp_from=default_bounce_adress,
            smtp_to_list=ANY,
            message_from='std@oDoo.cOm',
            from_filter='odoo.com',
        )

        # Use an email outside of the domain of the "from_filter"
        # So we will use the notifications email in the headers and the bounce address
        # in the envelop because the "from_filter" allows to use the entire domain
        with patch.object(TestingSMTPSession, 'send_email') as send_email, \
             patch.object(type(IrMailServer), 'connect', side_effect=o_connect) as connect:
            message = self._build_email(mail_from='std@gmail.com')
            IrMailServer.send_email(message)

        connect.assert_called_once()
        send_email.assert_called_once_with(
            smtp_from=default_bounce_adress,
            smtp_to_list=ANY,
            message_from='"std@gmail.com" <notifications@odoo.com>',
            from_filter='odoo.com',
        )

    @patch.dict("odoo.tools.config.options", {"from_filter": "odoo.com"})
    def test_mail_server_binary_arguments_domain_smtp_session(self):
        """Test the configuration provided in the odoo-bin arguments.

        This config is used when no mail server exists.
        Use a pre-configured SMTP session.
        """
        IrMailServer = self.env['ir.mail_server']
        o_connect = IrMailServer.connect
        default_bounce_adress = self.env['ir.mail_server']._get_default_bounce_address()

        # Remove all mail server so we will use the odoo-bin arguments
        self.env['ir.mail_server'].search([]).unlink()
        self.assertFalse(self.env['ir.mail_server'].search([]))

        # Use an email in the domain of the "from_filter"
        with patch.object(TestingSMTPSession, 'send_email') as send_email, \
             patch.object(type(IrMailServer), 'connect', side_effect=o_connect) as connect:
            smtp_session = IrMailServer.connect(smtp_from='std@odoo.com')
            message = self._build_email(mail_from='std@odoo.com')
            IrMailServer.send_email(message, smtp_session=smtp_session)

        connect.assert_called_once()
        send_email.assert_called_once_with(
            smtp_from=default_bounce_adress,
            smtp_to_list=ANY,
            message_from='std@odoo.com',
            from_filter='odoo.com',
        )

        # Use an email outside of the domain of the "from_filter"
        # So we will use the notifications email in the headers and the bounce address
        # in the envelop because the "from_filter" allows to use the entire domain
        with patch.object(TestingSMTPSession, 'send_email') as send_email, \
             patch.object(type(IrMailServer), 'connect', side_effect=o_connect) as connect:
            smtp_session = IrMailServer.connect(smtp_from='std@gmail.com')
            message = self._build_email(mail_from='std@gmail.com')
            IrMailServer.send_email(message, smtp_session=smtp_session)

        connect.assert_called_once()
        send_email.assert_called_once_with(
            smtp_from=default_bounce_adress,
            smtp_to_list=ANY,
            message_from='"std@gmail.com" <notifications@odoo.com>',
            from_filter='odoo.com',
        )

    def _build_email(self, mail_from, return_path=None):
        return self.env['ir.mail_server'].build_email(
            email_from=mail_from,
            email_to='dest@example-é.com',
            subject='subject', body='body',
            headers={'Return-Path': return_path} if return_path else None
        )
