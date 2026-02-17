# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models, api


class LoyaltyHistory(models.Model):
    _inherit = 'loyalty.history'

    balance = fields.Float()

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        for record in records:
            record.balance = record.card_id.points

        return records
