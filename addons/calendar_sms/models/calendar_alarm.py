# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class CalendarAlarm(models.Model):
    _inherit = 'calendar.alarm'

    _calendar_sms__sms_template_data_calendar_reminder = models.Ref('calendar_sms.sms_template_data_calendar_reminder', 'sms.template', required=False)

    alarm_type = fields.Selection(selection_add=[
        ('sms', 'SMS')
    ], ondelete={'sms': 'set default'})
    sms_template_id = fields.Many2one(
        'sms.template', string="SMS Template",
        domain=[('model', 'in', ['calendar.event'])],
        compute='_compute_sms_template_id', readonly=False, store=True,
        help="Template used to render SMS reminder content.")

    @api.depends('alarm_type', 'sms_template_id')
    def _compute_sms_template_id(self):
        for alarm in self:
            if alarm.alarm_type == 'sms' and not alarm.sms_template_id:
                alarm.sms_template_id = self._calendar_sms__sms_template_data_calendar_reminder.id
            elif alarm.alarm_type != 'sms' or not alarm.sms_template_id:
                alarm.sms_template_id = False
