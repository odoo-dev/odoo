# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class ResGroups(models.Model):
    _inherit = 'res.groups'

    _base__group_portal = models.Ref('base.group_portal', 'res.groups')

    def _get_light_group_xmlids(self):
        return (
            *super()._get_light_group_xmlids(),
            'lunch.group_lunch_user',
        )
