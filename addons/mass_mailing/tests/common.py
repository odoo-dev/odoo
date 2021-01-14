# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.addons.link_tracker.tests.common import MockLinkTracker
from odoo.addons.mail.tests.common import MailCase, MailCommon, mail_new_test_user


class MassMailCase(MailCase, MockLinkTracker):

    def assertMailTraces(self, recipients_info, mailing, records, author=None, check_mail=True):
        """ Check content of traces. Traces are fetched based on a given mailing
        and records. Their content is compared to recipients_info structure that
        holds expected information. Mail.mail records may optionally be checked.

        :param recipients_info: list[{
            'partner': res.partner record (may be empty),
            'email': email used when sending email (may be empty, computed based on partner),
            'state': outgoing / sent / ignored / bounced / exception / opened (sent by default) (sent by default),
            'record: linked record,
            'content': UDPATE ME
            'failure_type': optional: UPDATE ME
            }, { ... }]
        :param mailing: used to find traces;
        :param records: used to find traces;
        :param check_mail: if True, also check mail.mail records that should be
          linked to traces;
        """
        traces = self.env['mailing.trace'].search([
            ('mass_mailing_id', 'in', mailing.ids),
            ('res_id', 'in', records.ids)
        ])

        # ensure trace coherency
        self.assertTrue(all(s.model == records._name for s in traces))
        self.assertEqual(set(s.res_id for s in traces), set(records.ids))

        # check each traces
        for recipient_info in recipients_info:
            partner = recipient_info.get('partner', self.env['res.partner'])
            email = recipient_info.get('email')
            state = recipient_info.get('state', 'sent')
            record = recipient_info.get('record', records[0] if records and len(records) == 1 else None)
            content = recipient_info.get('content')
            if email is None and partner:
                email = partner.email_normalized

            recipient_trace = traces.filtered(
                lambda t: t.email == email and t.state == state and (t.res_id == record.id if record else True)
            )
            self.assertTrue(
                len(recipient_trace) == 1,
                'MailTrace: email %s (recipient %s, state: %s, record: %s): found %s records (1 expected)' % (email, partner, state, record, len(recipient_trace))
            )

            if check_mail:
                fields_values = {'mailing_id': mailing}
                if 'failure_type' in recipient_info:
                    fields_values['failure_type'] = recipient_info['failure_type']
                if content:
                    fields_values['body_html_content'] = content

                if state == 'sent':
                    self.assertMailMailWEmails([email], 'sent', content, author=author, fields_values=fields_values, check_email=True)
                elif state in ['opened', 'replied']:  # replied imply something has been sent
                    self.assertMailMailWEmails([email], 'sent', content, author=author, fields_values=fields_values, check_email=True)
                elif state == 'ignored':
                    self.assertMailMailWEmails([email], 'cancel', content, author=author, fields_values=fields_values)
                elif state == 'exception':
                    self.assertMailMailWEmails([email], 'exception', content, author=author, fields_values=fields_values, check_email=True)
                elif state == 'canceled':
                    self.assertMailMailWEmails([email], 'canceled', content, author=author, fields_values=fields_values)
                elif state == 'bounced':
                    self.assertMailMailWEmails([email], 'canceled', content, author=author, fields_values=fields_values, check_email=True)
                else:
                    raise NotImplementedError()


class MassMailCommon(MailCommon, MassMailCase):

    @classmethod
    def setUpClass(cls):
        super(MassMailCommon, cls).setUpClass()

        cls.user_marketing = mail_new_test_user(
            cls.env, login='user_marketing',
            groups='base.group_user,base.group_partner_manager,mass_mailing.group_mass_mailing_user',
            name='Martial Marketing', signature='--\nMartial')

        cls.email_reply_to = 'MyCompany SomehowAlias <test.alias@test.mycompany.com>'

    @classmethod
    def _create_mailing_list(cls):
        """ Shortcut to create mailing lists. Currently hardcoded, maybe evolve
        in a near future. """
        cls.mailing_list_1 = cls.env['mailing.list'].with_context(cls._test_context).create({
            'name': 'List1',
            'contact_ids': [
                (0, 0, {'name': 'Déboulonneur', 'email': 'fleurus@example.com'}),
                (0, 0, {'name': 'Gorramts', 'email': 'gorramts@example.com'}),
                (0, 0, {'name': 'Ybrant', 'email': 'ybrant@example.com'}),
            ]
        })
        cls.mailing_list_2 = cls.env['mailing.list'].with_context(cls._test_context).create({
            'name': 'List2',
            'contact_ids': [
                (0, 0, {'name': 'Gilberte', 'email': 'gilberte@example.com'}),
                (0, 0, {'name': 'Gilberte En Mieux', 'email': 'gilberte@example.com'}),
                (0, 0, {'name': 'Norbert', 'email': 'norbert@example.com'}),
                (0, 0, {'name': 'Ybrant', 'email': 'ybrant@example.com'}),
            ]
        })
