# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, models, _


class ResUsers(models.Model):
    _inherit = ['res.users']

    @api.model
    def _get_activity_groups(self):
        """ Update systray name of mailing.mailing from "Mass Mailing"
            to "Email Marketing".
        """
        activities = super()._get_activity_groups()
        for activity in activities:
            if activity.get('model') == 'mailing.mailing':
                activity['name'] = _('Email Marketing')
                break
        return activities
