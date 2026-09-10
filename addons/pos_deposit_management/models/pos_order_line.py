# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class PosOrderLine(models.Model):
    _inherit = "pos.order.line"

    deposit_parent_line_id = fields.Many2one(
        "pos.order.line",
        string="Deposit Parent",
        ondelete="cascade",
        copy=False,
    )
    deposit_line_id = fields.Many2one("pos.order.line", string="Deposit Line", ondelete="set null", copy=False)

    @api.model
    def _load_pos_data_fields(self, config):
        return super()._load_pos_data_fields(config) + ["deposit_parent_line_id", "deposit_line_id"]
