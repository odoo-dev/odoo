# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime

from odoo import api, fields, models


class Partner(models.Model):
    _inherit = 'res.partner'

    calendar_last_notif_ack = fields.Datetime(
        'Last notification marked as read from base Calendar', default=fields.Datetime.now)

    def get_attendee_detail(self, meeting_ids):
        """ Return a list of tuple (id, name, status, color, event_id, attendee_id, attendee_status)
            Used by:
                - base_calendar.js : Many2ManyAttendee
                - calendar_model.js (calendar.CalendarModel)
        """
        datas = []
        meetings = self.env['calendar.event'].browse(meeting_ids)

        for meeting in meetings:
            data = []
            for partner in self:
                data = partner.name_get()[0]
                data = [data[0], data[1], False, partner.color, False, False, False]
                for attendee in meeting.attendee_ids:
                    if attendee.partner_id.id == partner.id:
                        data[2] = attendee.state
                        data[4] = meeting.id
                        data[5] = attendee.id
                        data[6] = attendee.is_alone
                        datas.append(data)
        return datas

    @api.model
    def _set_calendar_last_notif_ack(self):
        partner = self.env['res.users'].browse(self.env.context.get('uid', self.env.uid)).partner_id
        partner.write({'calendar_last_notif_ack': datetime.now()})
