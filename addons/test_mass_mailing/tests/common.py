# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import datetime
import random

from odoo.addons.mass_mailing.tests.common import MassMailCommon
from odoo.addons.test_mail.tests.common import TestMailCommon


class TestMassMailCommon(MassMailCommon, TestMailCommon):

    @classmethod
    def setUpClass(cls):
        super(TestMassMailCommon, cls).setUpClass()

        cls.mailing_bl = cls.env['mailing.mailing'].create({
            'name': 'SourceName',
            'subject': 'MailingSubject',
            'body_html': '<p>Hello ${object.name}</p>',
            'mailing_type': 'mail',
            'mailing_model_id': cls.env['ir.model']._get('mailing.test.blacklist').id,
        })

    @classmethod
    def _create_mailing_test_records(cls, model='mailing.test.blacklist', partners=None, count=1):
        """ Helper to create data. Currently simple, to be improved. """
        Model = cls.env[model]
        email_field = 'email' if 'email' in Model else 'email_from'
        partner_field = 'customer_id' if 'customer_id' in Model else 'partner_id'

        vals_list = []
        for x in range(0, count):
            vals = {
                'name': 'TestRecord_%02d' % x,
                email_field: '"TestCustomer %02d" <test.record.%02d@test.example.com>' % (x, x),
            }
            if partners:
                vals[partner_field] = partners[x % len(partners)]

            vals_list.append(vals)

        return cls.env[model].create(vals_list)

    @classmethod
    def _create_bounce_trace(cls, record, dt=None):
        if dt is None:
            dt = datetime.datetime.now() - datetime.timedelta(days=1)
        randomized = random.random()
        if 'email_normalized' in record:
            trace_email = record.email_normalized
        elif 'email_from' in record:
            trace_email = record.email_from
        else:
            trace_email = record.email
        trace = cls.env['mailing.trace'].create({
            'model': record._name,
            'res_id': record.id,
            'trace_status': 'bounce',
            'trace_status_update': dt,
            # TDE FIXME: improve this with a mail-enabled heuristics
            'email': trace_email,
            'message_id': '<%5f@gilbert.boitempomils>' % randomized,
        })
        return trace
