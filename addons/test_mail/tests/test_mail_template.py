# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64
import datetime

from freezegun import freeze_time
from unittest.mock import patch

from odoo.addons.mail.tests.common import MailCommon
from odoo.addons.test_mail.tests.common import TestRecipients
from odoo.exceptions import ValidationError
from odoo.tests import tagged, users
from odoo.tools import mute_logger, safe_eval


class TestMailTemplateCommon(MailCommon, TestRecipients):

    @classmethod
    def setUpClass(cls):
        super(TestMailTemplateCommon, cls).setUpClass()
        cls.test_record = cls.env['mail.test.lang'].with_context(cls._test_context).create({
            'email_from': 'ignasse@example.com',
            'name': 'Test',
        })

        cls.user_employee.write({
            'groups_id': [(4, cls.env.ref('base.group_partner_manager').id)],
        })

        cls._attachments = [{
            'name': 'first.txt',
            'datas': base64.b64encode(b'My first attachment'),
            'res_model': 'res.partner',
            'res_id': cls.user_admin.partner_id.id
        }, {
            'name': 'second.txt',
            'datas': base64.b64encode(b'My second attachment'),
            'res_model': 'res.partner',
            'res_id': cls.user_admin.partner_id.id
        }]

        cls.email_1 = 'test1@example.com'
        cls.email_2 = 'test2@example.com'
        cls.email_3 = cls.partner_1.email

        # create a complete test template
        cls.test_template = cls._create_template('mail.test.lang', {
            'attachment_ids': [(0, 0, cls._attachments[0]), (0, 0, cls._attachments[1])],
            'body_html': '<p>EnglishBody for <t t-out="object.name"/></p>',
            'lang': '{{ object.customer_id.lang or object.lang }}',
            'email_to': '%s, %s' % (cls.email_1, cls.email_2),
            'email_cc': '%s' % cls.email_3,
            'partner_to': '%s,%s' % (cls.partner_2.id, cls.user_admin.partner_id.id),
            'subject': 'EnglishSubject for {{ object.name }}',
        })

        # activate translations
        cls._activate_multi_lang(
            layout_arch_db='<body><t t-out="message.body"/> English Layout for <t t-esc="model_description"/></body>',
            test_record=cls.test_record, test_template=cls.test_template
        )

        # admin should receive emails
        cls.user_admin.write({'notification_type': 'email'})
        # Force the attachments of the template to be in the natural order.
        cls.test_template.invalidate_recordset(['attachment_ids'])


@tagged('mail_template')
class TestMailTemplate(TestMailTemplateCommon):

    def test_template_add_context_action(self):
        self.test_template.create_action()

        # check template act_window has been updated
        self.assertTrue(bool(self.test_template.ref_ir_act_window))

        # check those records
        action = self.test_template.ref_ir_act_window
        self.assertEqual(action.name, 'Send Mail (%s)' % self.test_template.name)
        self.assertEqual(action.binding_model_id.model, 'mail.test.lang')

    @mute_logger('odoo.addons.mail.models.mail_mail')
    @users('employee')
    def test_template_schedule_email(self):
        """ Test scheduling email sending from template. """
        now = datetime.datetime(2024, 4, 29, 10, 49, 59)
        test_template = self.test_template.with_env(self.env)

        # schedule the mail in 3 days -> patch safe_eval.datetime access
        safe_eval_orig = safe_eval.safe_eval

        def _safe_eval_hacked(*args, **kwargs):
            """ safe_eval wraps 'datetime' and freeze_time does not mock it;
            simplest solution found so far is to directly hack safe_eval just
            for this test """
            if args[0] == "datetime.datetime.now() + datetime.timedelta(days=3)":
                return now + datetime.timedelta(days=3)
            return safe_eval_orig(*args, **kwargs)

        # patch datetime and safe_eval.datetime, as otherwise using standard 'now'
        # might lead to errors due to test running right before minute switch it
        # sometimes ends at minute+1 and assert fails - see runbot-54946
        with patch.object(safe_eval, "safe_eval", autospec=True, side_effect=_safe_eval_hacked):
            test_template.scheduled_date = '{{datetime.datetime.now() + datetime.timedelta(days=3)}}'
            with freeze_time(now):
                mail_id = test_template.send_mail(self.test_record.id)
            mail = self.env['mail.mail'].sudo().browse(mail_id)
        self.assertEqual(
            mail.scheduled_date.replace(second=0, microsecond=0),
            (now + datetime.timedelta(days=3)).replace(second=0, microsecond=0),
        )
        self.assertEqual(mail.state, 'outgoing')

        # check a wrong format
        test_template.scheduled_date = '{{"test " * 5}}'
        with freeze_time(now):
            mail_id = test_template.send_mail(self.test_record.id)
        mail = self.env['mail.mail'].sudo().browse(mail_id)
        self.assertFalse(mail.scheduled_date)
        self.assertEqual(mail.state, 'outgoing')

    @mute_logger('odoo.addons.mail.models.mail_mail')
    def test_template_send_mail_body(self):
        """ Test that the body and body_html is set correctly in 'mail.mail'
        when sending an email from mail.template """
        mail_id = self.test_template.send_mail(self.test_record.id)
        mail = self.env['mail.mail'].sudo().browse(mail_id)
        body_result = '<p>EnglishBody for %s</p>' % self.test_record.name

        self.assertEqual(mail.body_html, body_result)
        self.assertEqual(mail.body, body_result)

    def test_mail_template_non_mail_thread_model(self):
        """Check only mail.thread models can be set on templates."""
        # create
        with self.assertRaises(ValidationError), self.cr.savepoint():
            self.env['mail.template'].create({
                'name': 'Test non thread template',
                'model_id': self.env['ir.model']._get('mail.test.nothread').id,  # non mail thread model
            })

        template = self.env['mail.template'].create({
            'name': 'Test non thread template',
            'model_id': self.env['ir.model']._get('res.partner').id,
        })

        # write
        with self.assertRaises(ValidationError), self.cr.savepoint():
            template.write({
                'name': 'Test non thread template',
                'model_id': self.env['ir.model']._get('mail.test.nothread').id,
            })


@tagged('mail_template', 'multi_lang')
class TestMailTemplateLanguages(TestMailTemplateCommon):

    @mute_logger('odoo.addons.mail.models.mail_mail')
    def test_template_send_email(self):
        mail_id = self.test_template.send_mail(self.test_record.id)
        mail = self.env['mail.mail'].sudo().browse(mail_id)
        self.assertEqual(mail.email_cc, self.test_template.email_cc)
        self.assertEqual(mail.email_to, self.test_template.email_to)
        self.assertEqual(mail.recipient_ids, self.partner_2 | self.user_admin.partner_id)
        self.assertEqual(mail.subject, 'EnglishSubject for %s' % self.test_record.name)

    @mute_logger('odoo.addons.mail.models.mail_mail')
    def test_template_translation_lang(self):
        test_record = self.test_record.with_env(self.env)
        test_record.write({
            'lang': 'es_ES',
        })
        test_template = self.test_template.with_env(self.env)
        test_template.write({
            'email_layout_xmlid': 'mail.test_layout',
        })

        mail_id = test_template.send_mail(test_record.id)
        mail = self.env['mail.mail'].sudo().browse(mail_id)
        self.assertEqual(mail.body_html,
                         '<body><p>SpanishBody for %s</p> Spanish Layout para Spanish Model Description</body>' % self.test_record.name)
        self.assertEqual(mail.subject, 'SpanishSubject for %s' % self.test_record.name)

    @mute_logger('odoo.addons.mail.models.mail_mail')
    def test_template_translation_partner_lang(self):
        test_record = self.env['mail.test.lang'].browse(self.test_record.ids)
        customer = self.env['res.partner'].create({
            'email': 'robert.carlos@test.example.com',
            'lang': 'es_ES',
            'name': 'Roberto Carlos',
            })
        test_record.write({
            'customer_id': customer.id,
        })
        test_template = self.env['mail.template'].browse(self.test_template.ids)

        mail_id = test_template.send_mail(test_record.id, email_layout_xmlid='mail.test_layout')
        mail = self.env['mail.mail'].sudo().browse(mail_id)
        self.assertEqual(mail.body_html,
                         '<body><p>SpanishBody for %s</p> Spanish Layout para Spanish Model Description</body>' % self.test_record.name)
        self.assertEqual(mail.subject, 'SpanishSubject for %s' % self.test_record.name)
