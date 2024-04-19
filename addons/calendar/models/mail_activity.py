# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields, tools, _
from odoo.tools import is_html_empty
from odoo.addons.mail.tools.discuss import Store


class MailActivity(models.Model):
    _inherit = "mail.activity"

    calendar_event_id = fields.Many2one('calendar.event', string="Calendar Meeting", ondelete='cascade')

    def action_create_calendar_event(self):
        self.ensure_one()
        action = self.env["ir.actions.actions"]._for_xml_id("calendar.action_calendar_event")
        action['context'] = {
            'default_activity_type_id': self.activity_type_id.id,
            'default_res_id': self.env.context.get('default_res_id'),
            'default_res_model': self.env.context.get('default_res_model'),
            'default_name': self.summary or self.res_name,
            'default_description': self.note if not is_html_empty(self.note) else '',
            'default_activity_ids': [(6, 0, self.ids)],
            'default_partner_ids': self.user_id.partner_id.ids,
            'default_user_id': self.user_id.id,
            'initial_date': self.date_deadline,
            'default_calendar_event_id': self.calendar_event_id.id,
        }
        return action

    def _action_done(self, feedback=False, attachment_ids=False):
        events = self.calendar_event_id
        # To avoid the feedback to be included in the activity note (due to the synchronization in event.write
        # that updates the related activity note each time the event description is updated),
        # when the activity is written as a note in the chatter in _action_done (leading to duplicate feedback),
        # we call super before updating the description. As self is deleted in super, we load the related events before.
        messages, activities = super(MailActivity, self)._action_done(feedback=feedback, attachment_ids=attachment_ids)
        if feedback:
            for event in events:
                description = event.description
                description = '%s<br />%s' % (
                    description if not tools.is_html_empty(description) else '',
                    _('Feedback: %(feedback)s', feedback=tools.plaintext2html(feedback)) if feedback else '',
                )
                event.write({'description': description})
        return messages, activities

    def unlink_w_meeting(self):
        events = self.mapped('calendar_event_id')
        res = self.unlink()
        events.unlink()
        return res

    # ------------------------------------------------------------
    # OVERRIDE
    # ------------------------------------------------------------

    def _to_store(self, store: Store):
        super()._to_store(store)
        calendar_event_ids = self.mapped('calendar_event_id').ids
        if calendar_event_ids:
            calendar_events = self.env['calendar.event'].search_read(
                [('id', 'in', calendar_event_ids)], ['start', 'stop']
            )
            calendar_event_dict = {event['id']: event for event in calendar_events}
            for activity in self:
                if activity.calendar_event_id:
                    data = activity.read()[0]
                    calendar_event = calendar_event_dict.get(data['calendar_event_id'][0])
                    data['start'] = calendar_event['start']
                    data['stop'] = calendar_event['stop']
                    store.add("mail.activity", data)
