# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.addons.test_mail_full.tests.common import TestMailFullCommon
from odoo.tests.common import users
from odoo.tools import config, mute_logger
from odoo.tests import tagged


@tagged('mass_mailing')
class TestMassMailing(TestMailFullCommon):

    @classmethod
    def setUpClass(cls):
        super(TestMassMailing, cls).setUpClass()

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
        recipients = self._create_mailing_test_records(model='mailing.test.optout', count=10)

        # optout records 1 and 2
        (recipients[1] | recipients[2]).write({'opt_out': True})
        # blacklist records 3 and 4
        self.env['mail.blacklist'].create({'email': recipients[3].email_normalized})
        self.env['mail.blacklist'].create({'email': recipients[4].email_normalized})
        # have a duplicate email for 9
        recipient_dup_1 = recipients[9].copy()
        # have a void mail
        recipient_void_1 = self.env['mailing.test.optout'].create({'name': 'TestRecord_void_1'})
        # have a falsy mail
        recipient_falsy_1 = self.env['mailing.test.optout'].create({
            'name': 'TestRecord_falsy_1',
            'email_from': 'falsymail'
        })
        recipients_all = recipients + recipient_dup_1 + recipient_void_1 + recipient_falsy_1

        mailing.write({'mailing_domain': [('id', 'in', recipients_all.ids)]})
        mailing.action_put_in_queue()
        with self.mock_mail_gateway(mail_unlink_sent=False):
            mailing._process_mass_mailing_queue()

        for recipient in recipients_all:
            recipient_info = {
                'email': recipient.email_normalized,
                'content': 'Hello <span class="text-muted">%s</span' % recipient.name}
            # opt-out: ignored (cancel mail)
            if recipient in recipients[1] | recipients[2]:
                recipient_info['state'] = 'ignored'
            # blacklisted: ignored (cancel mail)
            elif recipient in recipients[3] | recipients[4]:
                recipient_info['state'] = 'ignored'
            # duplicates: ignored (cancel mail)
            elif recipient == recipient_dup_1:
                recipient_info['state'] = 'ignored'
            # void: ignored (cancel mail)
            elif recipient == recipient_void_1:
                recipient_info['state'] = 'ignored'
            # falsy: ignored (cancel mail)
            elif recipient == recipient_falsy_1:
                recipient_info['state'] = 'ignored'
                recipient_info['email'] = recipient.email_from  # normalized is False but email should be falsymail
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

        self.assertEqual(mailing.sent, 0, 'Mailing: sent: 0 (still outgoing mails)')
        self.assertEqual(mailing.scheduled, 6, 'Mailing: scheduled: 10 valid - 2 bl - 2 optout')
        self.assertEqual(mailing.ignored, 7, 'Mailing: ignored: 2 bl + 2 optout + 3 invalid')
        self.assertEqual(mailing.failed, 0)
        self.assertEqual(mailing.expected, 6)
        self.assertEqual(mailing.delivered, 0)
