# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.addons.mail.tests.common import MailCommon
from odoo.exceptions import AccessError
from odoo.tests import Form, users


class TestMailTemplate(MailCommon):

    @classmethod
    def setUpClass(cls):
        super(TestMailTemplate, cls).setUpClass()
        # Enable the Jinja rendering restriction
        cls.env['ir.config_parameter'].set_param('mail.restrict.template.rendering', True)
        cls.user_employee.groups_id -= cls.env.ref('mail.group_mail_template_editor')

        cls.mail_template = cls.env['mail.template'].create({
            'name': 'Test template',
            'subject': '{{ 1 + 5 }}',
            'body_html': '<t t-out="4 + 9"/>',
            'lang': '{{ object.lang }}',
            'auto_delete': True,
            'model_id': cls.env.ref('base.model_res_partner').id,
        })

    @users('employee')
    def test_mail_compose_message_content_from_template(self):
        form = Form(self.env['mail.compose.message'])
        form.template_id = self.mail_template
        mail_compose_message = form.save()

        self.assertEqual(mail_compose_message.subject, '6', 'We must trust mail template values')

    @users('employee')
    def test_mail_compose_message_content_from_template_mass_mode(self):
        mail_compose_message = self.env['mail.compose.message'].create({
            'composition_mode': 'mass_mail',
            'model': 'res.partner',
            'template_id': self.mail_template.id,
            'subject': '{{ 1 + 5 }}',
        })

        values = mail_compose_message.get_mail_values(self.partner_employee.ids)

        self.assertEqual(values[self.partner_employee.id]['subject'], '6', 'We must trust mail template values')
        self.assertIn('13', values[self.partner_employee.id]['body_html'], 'We must trust mail template values')

    def test_mail_template_acl(self):
        # Sanity check
        self.assertTrue(self.user_admin.has_group('mail.group_mail_template_editor'))
        self.assertFalse(self.user_employee.has_group('mail.group_mail_template_editor'))

        # Group System can create / write / unlink mail template
        mail_template = self.env['mail.template'].with_user(self.user_admin).create({'name': 'Test template'})
        self.assertEqual(mail_template.name, 'Test template')

        mail_template.with_user(self.user_admin).name = 'New name'
        self.assertEqual(mail_template.name, 'New name')

        # Standard employee can create and edit non-dynamic templates
        employee_template = self.env['mail.template'].with_user(self.user_employee).create({'body_html': '<p>foo</p>'})

        employee_template.with_user(self.user_employee).body_html = '<p>bar</p>'

        employee_template = self.env['mail.template'].with_user(self.user_employee).create({'email_to': 'foo@bar.com'})

        employee_template.with_user(self.user_employee).email_to = 'bar@foo.com'

        # Standard employee cannot create and edit templates with dynamic qweb
        with self.assertRaises(AccessError):
            self.env['mail.template'].with_user(self.user_employee).create({'body_html': '<p t-esc="\'foo\'"></p>'})

        # Standard employee cannot edit templates from another user, non-dynamic and dynamic
        with self.assertRaises(AccessError):
            mail_template.with_user(self.user_employee).body_html = '<p>foo</p>'
        with self.assertRaises(AccessError):
            mail_template.with_user(self.user_employee).body_html = '<p t-esc="\'foo\'"></p>'

        # Standard employee can edit his own templates if not dynamic
        employee_template.with_user(self.user_employee).body_html = '<p>foo</p>'

        # Standard employee cannot create and edit templates with dynamic inline fields
        with self.assertRaises(AccessError):
            self.env['mail.template'].with_user(self.user_employee).create({'email_to': '{{ object.partner_id.email }}'})

        # Standard employee cannot edit his own templates if dynamic
        with self.assertRaises(AccessError):
            employee_template.with_user(self.user_employee).body_html = '<p t-esc="\'foo\'"></p>'

        with self.assertRaises(AccessError):
            employee_template.with_user(self.user_employee).email_to = '{{ object.partner_id.email }}'

    def test_mail_template_acl_translation(self):
        ''' Test that a user that doenn't have the group_mail_template_editor cannot create / edit
        translation with dynamic code if he cannot write dynamic code on the related record itself.
        '''

        self.env.ref('base.lang_fr').sudo().active = True

        employee_template = self.env['mail.template'].with_user(self.user_employee).create({
            'model_id': self.env.ref('base.model_res_partner').id,
            'subject': 'The subject',
            'body_html': '<p>foo</p>',
        })

        ### check qweb dynamic
        # write on translation for template without dynamic code is allowed
        employee_template.update_field_translations('body_html', {'fr_FR': 'non-qweb'})

        # cannot write dynamic code on mail_template translation for employee without the group mail_template_editor.
        with self.assertRaises(AccessError):
            employee_template.update_field_translations('body_html', {'fr_FR': '<t t-esc="foo"/>'})
        self.assertTrue(employee_template.sudo().update_field_translations('body_html', {'fr_FR': '<t t-esc="foo"/>'}))

        # reset the body_html to static
        employee_template.body_html = ''
        employee_template.body_html = '<p>foo</p>'

        ### check qweb inline dynamic
        # write on translation for template without dynamic code is allowed
        employee_template.update_field_translations('subject', {'fr_FR': 'non-qweb'})

        # cannot write dynamic code on mail_template translation for employee without the group mail_template_editor.
        with self.assertRaises(AccessError):
            employee_template.update_field_translations('subject', {'fr_FR': '{{ object.foo }}'})
        self.assertTrue(employee_template.sudo().update_field_translations('subject', {'fr_FR': '{{ object.foo }}'}))
