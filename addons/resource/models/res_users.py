# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class ResUsers(models.Model):
    _inherit = 'res.users'

    resource_ids = fields.One2many(
        'resource.resource', 'user_id', 'Resources')
    resource_calendar_id = fields.Many2one(
        'resource.calendar', 'Default Working Hours',
        compute='_compute_resource_calendar_id', search='_search_resource_calendar_id', compute_sudo=True,
    )

    @api.depends('resource_ids.calendar_id')
    def _compute_resource_calendar_id(self):
        for user in self:
            user.resource_calendar_id = next((res.calendar_id for res in user.resource_ids), False)

    def _search_resource_calendar_id(self, operator, value):
        return [('resource_ids.calendar_id', operator, value)]

    def write(self, vals):
        rslt = super().write(vals)

        # If the timezone of the admin user gets set on their first login, also update the timezone of the default working calendar
        if (vals.get('tz') and len(self) == 1 and not self.env.user.login_date
            and self.env.user == self.env.ref('base.user_admin', False) and self == self.env.user):
            if self.resource_calendar_id:
                self.resource_calendar_id.tz = vals['tz']
            else:
                self.env.ref('resource.resource_calendar_std', False).tz = vals['tz']

        return rslt
