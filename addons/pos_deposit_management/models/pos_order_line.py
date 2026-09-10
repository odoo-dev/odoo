# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class PosOrderLine(models.Model):
    _inherit = 'pos.order.line'

    deposit_parent_line_id = fields.Many2one(
        'pos.order.line', string='Deposit Parent', ondelete='cascade', copy=False,
    )
    deposit_line_id = fields.Many2one(
        'pos.order.line', string='Deposit Line', ondelete='set null', copy=False,
    )

    @api.model
    def _load_pos_data_fields(self, config):
        params = super()._load_pos_data_fields(config)
        params += ['deposit_parent_line_id', 'deposit_line_id']
        return params

    @api.model_create_multi
    def create(self, vals_list):
        lines = super().create(vals_list)
        for line in lines:
            line._sync_deposit_relation()
        return lines

    def write(self, vals):
        res = super().write(vals)
        for line in self:
            line._sync_deposit_relation()
        return res

    def _sync_deposit_relation(self):
        self.ensure_one()
        if self.deposit_parent_line_id:
            parent = self.deposit_parent_line_id
            if parent.deposit_line_id != self:
                parent.deposit_line_id = self.id
        elif self.deposit_line_id:
            deposit = self.deposit_line_id
            if deposit.deposit_parent_line_id != self:
                deposit.deposit_parent_line_id = self.id
