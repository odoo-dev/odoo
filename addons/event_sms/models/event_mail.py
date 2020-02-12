# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class EventTypeMail(models.Model):
    _inherit = 'event.type.mail'

    @api.model
    def _selection_template_model(self):
        return super(EventTypeMail, self)._selection_template_model() + [('sms.template', 'SMS')]

    notification_type = fields.Selection(selection_add=[('sms', 'SMS')], ondelete={'sms': 'set default'})

    @api.depends('notification_type')
    def _compute_notification_type_model_id(self):
        sms_model = self.env['ir.model'].sudo().search([('model', '=', 'sms.template')], limit=1)
        sms_mails = self.filtered(lambda mail: mail.notification_type == 'sms')
        sms_mails.notification_type_model_id = sms_model
        super(EventTypeMail, self - sms_mails)._compute_notification_type_model_id()


class EventMailScheduler(models.Model):
    _inherit = 'event.mail'

    @api.model
    def _selection_template_model(self):
        return super(EventMailScheduler, self)._selection_template_model() + [('sms.template', 'SMS')]

    notification_type = fields.Selection(selection_add=[('sms', 'SMS')], ondelete={'sms': 'set default'})

    @api.depends('notification_type')
    def _compute_notification_type_model_id(self):
        sms_model = self.env['ir.model'].sudo().search([('model', '=', 'sms.template')], limit=1)
        sms_mails = self.filtered(lambda mail: mail.notification_type == 'sms')
        sms_mails.notification_type_model_id = sms_model
        super(EventMailScheduler, self - sms_mails)._compute_notification_type_model_id()

    def execute(self):
        for mail in self:
            now = fields.Datetime.now()
            if mail.interval_type != 'after_sub':
                # Do not send SMS if the communication was scheduled before the event but the event is over
                if not mail.mail_sent and (mail.interval_type != 'before_event' or mail.event_id.date_end > now) and mail.notification_type == 'sms' and mail.template_ref:
                    self.env['event.registration']._message_sms_schedule_mass(
                        template=mail.template_ref,
                        active_domain=[('event_id', '=', mail.event_id.id), ('state', '!=', 'cancel')],
                        mass_keep_log=True
                    )
                    mail.write({'mail_sent': True})
        return super(EventMailScheduler, self).execute()


class EventMailRegistration(models.Model):
    _inherit = 'event.mail.registration'

    def execute(self):
        for record in self:
            if record.registration_id.state in ['open', 'done'] and not record.mail_sent and record.scheduler_id.notification_type == 'sms':
                record.registration_id._message_sms_schedule_mass(template=record.scheduler_id.template_ref, mass_keep_log=True)
                record.write({'mail_sent': True})
        return super(EventMailRegistration, self).execute()
