# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class ResGroups(models.Model):
    _inherit = 'res.groups'

    _base__group_portal = models.Ref('base.group_portal', 'res.groups')
    _base__group_user = models.Ref('base.group_user', 'res.groups')
    _stock__group_production_lot = models.Ref('stock.group_production_lot', 'res.groups')

    def _get_light_group_xmlids(self):
        return (
            *super()._get_light_group_xmlids(),
            'product_expiry.group_expiry_date_on_delivery_slip',
        )
