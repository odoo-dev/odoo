# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class ResGroups(models.Model):
    _inherit = 'res.groups'

    _website__group_multi_website = models.Ref('website.group_multi_website', 'res.groups')

    def _get_light_group_xmlids(self):
        return (
            *super()._get_light_group_xmlids(),
            'website.group_multi_website',
        )
