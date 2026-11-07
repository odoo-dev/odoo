# -*- coding: utf-8 -*-

from odoo import models, api


class ResConfigSettings(models.TransientModel):
    _inherit = "res.config.settings"

    _pos_self_order_sale__pos_sales_team = models.Ref('pos_self_order_sale.pos_sales_team', 'crm.team', required=False)

    @api.onchange("pos_self_ordering_mode")
    def _onchange_pos_self_order_kiosk(self):
        super()._onchange_pos_self_order_kiosk()

        for record in self:
            if record.pos_config_id.self_ordering_mode == 'kiosk':
                if not record.pos_crm_team_id:
                    record.pos_crm_team_id = self._pos_self_order_sale__pos_sales_team
